import {
  decodeServerMessage,
  SUPERSEDED_CLOSE_CODE,
} from "@agent-native/protocol";
import { Effect, Result, Schedule, Schema } from "effect";
import { Machine } from "effect-machine";

import { connectionMachine, ConnectionEvent } from "./connection-machine";
import type { RealtimeStore } from "./realtime-store";

class RealtimeConnectionError extends Schema.TaggedError<RealtimeConnectionError>()(
  "RealtimeConnectionError",
  { message: Schema.String }
) {}

/** Success value of one attempt: the socket was up and then closed cleanly. */
type SessionEnded = "session-ended";

interface OpenSocket {
  readonly listeners: AbortController;
  readonly socket: WebSocket;
}

const connectAttempt = Effect.fn("connectAttempt")(
  (store: RealtimeStore, url: string) =>
    Effect.scoped(
      Machine.scoped(
        Effect.gen(function* attempt() {
          const actor = yield* Machine.spawn(connectionMachine);
          yield* actor.start;
          // The DOM listeners below are not Effects, so they drive the machine
          // through its synchronous client rather than forking a fiber each.
          const machine = actor.client;

          // `Effect.acquireRelease` releases on every exit - success, failure,
          // and interruption alike. The previous shape used
          // `Effect.callback`, whose finalizer runs only on interruption, so
          // the error path had to remember to close the socket itself and a
          // missed path leaked one socket and four listeners per attempt.
          yield* Effect.acquireRelease(
            Effect.sync((): OpenSocket => {
              store.setConnecting();
              const socket = new WebSocket(url);
              const listeners = new AbortController();
              const options = { signal: listeners.signal };

              socket.addEventListener(
                "open",
                () => {
                  machine.send(ConnectionEvent.Opened({ at: Date.now() }));
                  store.attach(socket);
                },
                options
              );

              socket.addEventListener(
                "message",
                (event) => {
                  const decoded = decodeServerMessage(event.data);
                  if (Result.isSuccess(decoded)) {
                    store.apply(decoded.success);
                    return;
                  }
                  store.reportError(
                    `Undecodable server message: ${decoded.failure.message}`
                  );
                },
                options
              );

              socket.addEventListener(
                "error",
                () => {
                  machine.send(
                    ConnectionEvent.TransportError({
                      message: "Realtime transport unavailable",
                    })
                  );
                },
                options
              );

              socket.addEventListener(
                "close",
                (event) => {
                  if (event.code === SUPERSEDED_CLOSE_CODE) {
                    // Another connection holds this identity now, most likely
                    // a tab that copied this one's storage. Presenting the
                    // same claim again would take it back and start a tug of
                    // war between the two.
                    store.forgetIdentity();
                  }
                  machine.send(
                    ConnectionEvent.SocketClosed({ at: Date.now() })
                  );
                },
                options
              );

              return { listeners, socket };
            }),
            ({ listeners, socket }) =>
              Effect.sync(() => {
                // Detaching here rather than per-outcome keeps one exit path,
                // and passing the socket means a superseded attempt cannot
                // clear a connection a later one already established.
                const state = machine.getSnapshot();
                store.detach(
                  state._tag === "Failed" ? state.message : null,
                  socket
                );
                listeners.abort();
                if (socket.readyState < WebSocket.CLOSING) {
                  socket.close(1000, "client shutdown");
                }
              })
          );

          const outcome = yield* actor.awaitOutput;

          if (outcome._tag === "Failed") {
            return yield* Effect.fail(
              new RealtimeConnectionError({ message: outcome.message })
            );
          }

          return "session-ended" satisfies SessionEnded;
        })
      )
    )
);

/**
 * Exponential backoff capped by a fixed ceiling. `Schedule.exponential` alone is
 * unbounded: at factor two from 400ms, the twelfth attempt waits about a quarter
 * of an hour and the sixteenth several hours, so a client that dropped a few
 * times over a session would appear to stop reconnecting altogether.
 */
export const reconnectSchedule = Schedule.min([
  Schedule.exponential("400 millis"),
  Schedule.spaced("10 seconds"),
]).pipe(Schedule.jittered);

export const realtimeProgram = (store: RealtimeStore, url: string) =>
  connectAttempt(store, url).pipe(
    Effect.retry(reconnectSchedule),
    // Each pass builds a fresh retry state, so the backoff resets structurally
    // after every stable session rather than through a mutable attempt counter.
    Effect.forever
  );
