import { describe, expect, test } from "bun:test";

import { Effect } from "effect";
import { Machine } from "effect-machine";

import {
  ConnectionEvent,
  ConnectionState,
  connectionMachine,
  STABLE_SESSION_MS,
} from "../src/lib/connection-machine";

const OPENED_AT = 1000;

const scoped = async <A, E>(body: Effect.Effect<A, E>): Promise<A> =>
  await Effect.runPromise(Effect.scoped(Machine.scoped(body)));

describe("connection machine", () => {
  const spawn = Effect.gen(function* spawned() {
    const actor = yield* Machine.spawn(connectionMachine);
    yield* actor.start;
    return actor;
  });

  test("opens from connecting and carries the timestamp", async () => {
    const state = await scoped(
      Effect.gen(function* opens() {
        const actor = yield* spawn;
        return yield* actor.sendAndWait(
          ConnectionEvent.Opened({ at: OPENED_AT }),
          ConnectionState.Open
        );
      })
    );

    // States carry effect-machine's brand, so compare a derived plain value
    // rather than the object: a wrong variant yields null and still fails.
    expect(state._tag === "Open" ? state.openedAt : null).toBe(OPENED_AT);
  });

  test("a session that lasted counts as ended, not failed", async () => {
    const output = await scoped(
      Effect.gen(function* ended() {
        const actor = yield* spawn;
        yield* actor.sendAndWait(
          ConnectionEvent.Opened({ at: OPENED_AT }),
          ConnectionState.Open
        );
        yield* actor.send(
          ConnectionEvent.SocketClosed({
            at: OPENED_AT + STABLE_SESSION_MS,
          })
        );
        return yield* actor.awaitOutput;
      })
    );

    expect(output._tag).toBe("Ended");
  });

  test("a close before the threshold fails so the backoff applies", async () => {
    const output = await scoped(
      Effect.gen(function* tooShort() {
        const actor = yield* spawn;
        yield* actor.sendAndWait(
          ConnectionEvent.Opened({ at: OPENED_AT }),
          ConnectionState.Open
        );
        yield* actor.send(
          ConnectionEvent.SocketClosed({
            at: OPENED_AT + STABLE_SESSION_MS - 1,
          })
        );
        return yield* actor.awaitOutput;
      })
    );

    // Reporting this as success would send realtimeProgram straight back round
    // through Effect.forever with no delay, which is the accept-then-drop
    // storm the threshold exists to prevent.
    expect(output._tag).toBe("Failed");
  });

  test("closing before ever opening fails", async () => {
    const output = await scoped(
      Effect.gen(function* neverOpened() {
        const actor = yield* spawn;
        yield* actor.send(ConnectionEvent.SocketClosed({ at: OPENED_AT }));
        return yield* actor.awaitOutput;
      })
    );

    expect(output._tag).toBe("Failed");
  });

  test("a transport error carries its message through", async () => {
    const output = await scoped(
      Effect.gen(function* errored() {
        const actor = yield* spawn;
        yield* actor.send(ConnectionEvent.TransportError({ message: "boom" }));
        return yield* actor.awaitOutput;
      })
    );

    expect(output._tag === "Failed" ? output.message : null).toBe("boom");
  });

  test("cannot open twice, so no flag is needed to prevent it", async () => {
    const canReopen = await scoped(
      Effect.gen(function* reopen() {
        const actor = yield* spawn;
        yield* actor.sendAndWait(
          ConnectionEvent.Opened({ at: OPENED_AT }),
          ConnectionState.Open
        );
        return yield* actor.can(ConnectionEvent.Opened({ at: 9999 }));
      })
    );

    expect(canReopen).toBe(false);
  });

  test("a late error cannot disturb an attempt that already finished", async () => {
    const after = await scoped(
      Effect.gen(function* late() {
        const actor = yield* spawn;
        yield* actor.sendAndWait(
          ConnectionEvent.Opened({ at: OPENED_AT }),
          ConnectionState.Open
        );
        yield* actor.send(
          ConnectionEvent.SocketClosed({
            at: OPENED_AT + STABLE_SESSION_MS,
          })
        );
        yield* actor.awaitOutput;
        yield* actor.send(ConnectionEvent.TransportError({ message: "late" }));
        return yield* actor.snapshot;
      })
    );

    expect(after._tag).toBe("Ended");
  });
});
