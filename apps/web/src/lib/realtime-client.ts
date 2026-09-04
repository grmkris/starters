import { decodeServerMessage } from "@agent-native/protocol";
import { Effect, Result, Schedule, Schema } from "effect";

import type { RealtimeStore } from "./realtime-store";

class RealtimeConnectionError extends Schema.TaggedError<RealtimeConnectionError>()(
  "RealtimeConnectionError",
  { message: Schema.String }
) {}

const connectAttempt = Effect.fn("connectAttempt")(
  (store: RealtimeStore, url: string) =>
    Effect.callback<never, RealtimeConnectionError>((resume) => {
      store.setConnecting();
      const socket = new WebSocket(url);
      let settled = false;

      const fail = (message: string): void => {
        if (settled) {
          return;
        }
        settled = true;
        store.detach(message);
        resume(Effect.fail(new RealtimeConnectionError({ message })));
      };

      socket.addEventListener("open", () => {
        store.attach(socket);
      });
      socket.addEventListener("message", (event) => {
        const decoded = decodeServerMessage(event.data);
        if (Result.isSuccess(decoded)) {
          store.apply(decoded.success);
        }
      });
      socket.addEventListener("error", () => {
        fail("Realtime transport unavailable");
      });
      socket.addEventListener("close", () => {
        fail("Realtime transport closed");
      });

      return Effect.sync(() => {
        settled = true;
        store.detach();
        if (socket.readyState < WebSocket.CLOSING) {
          socket.close(1000, "client shutdown");
        }
      });
    })
);

const reconnectSchedule = Schedule.exponential("400 millis").pipe(
  Schedule.jittered
);

export const realtimeProgram = (store: RealtimeStore, url: string) =>
  connectAttempt(store, url).pipe(Effect.retry(reconnectSchedule));
