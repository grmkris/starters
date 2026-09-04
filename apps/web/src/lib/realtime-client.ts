import { decodeServerMessage } from "@agent-native/protocol";
import { Effect, Result, Schedule, Schema } from "effect";

import type { RealtimeStore } from "./realtime-store";

class RealtimeConnectionError extends Schema.TaggedError<RealtimeConnectionError>()(
  "RealtimeConnectionError",
  { message: Schema.String }
) {}

/**
 * A connection that stayed up this long counts as a session rather than a
 * failed attempt. Without a threshold, a server that accepts and immediately
 * drops would look like repeated success and reconnect with no delay at all.
 */
const STABLE_SESSION_MS = 2000;

/** Success value of one attempt: the socket was up and then closed cleanly. */
type SessionEnded = "session-ended";

const connectAttempt = Effect.fn("connectAttempt")(
  (store: RealtimeStore, url: string) =>
    Effect.callback<SessionEnded, RealtimeConnectionError>((resume) => {
      store.setConnecting();
      const socket = new WebSocket(url);
      const listeners = new AbortController();
      let settled = false;
      let openedAt: number | null = null;

      // `Effect.callback`'s returned finalizer only runs on interruption, so
      // every path that resumes has to release the socket itself or each failed
      // attempt leaks one socket and its listeners.
      const teardown = (): void => {
        listeners.abort();
        if (socket.readyState < WebSocket.CLOSING) {
          socket.close(1000, "client shutdown");
        }
      };

      const settle = (
        outcome: Effect.Effect<SessionEnded, RealtimeConnectionError>
      ): void => {
        if (settled) {
          return;
        }
        settled = true;
        teardown();
        resume(outcome);
      };

      const fail = (message: string): void => {
        store.detach(message, socket);
        settle(Effect.fail(new RealtimeConnectionError({ message })));
      };

      const options = { signal: listeners.signal };

      socket.addEventListener(
        "open",
        () => {
          openedAt = Date.now();
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
          fail("Realtime transport unavailable");
        },
        options
      );

      socket.addEventListener(
        "close",
        () => {
          if (openedAt !== null && Date.now() - openedAt >= STABLE_SESSION_MS) {
            // Ending a real session succeeds, so the retry schedule below is
            // rebuilt from scratch on the next attempt instead of escalating.
            store.detach(null, socket);
            settle(Effect.succeed("session-ended"));
            return;
          }
          fail("Realtime transport closed");
        },
        options
      );

      return Effect.sync(() => {
        settled = true;
        store.detach(null, socket);
        teardown();
      });
    })
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
