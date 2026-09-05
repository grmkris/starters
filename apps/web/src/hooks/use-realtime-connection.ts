import { Effect, Fiber } from "effect";
import { useEffect } from "react";

import { realtimeProgram } from "../lib/realtime-client";
import { realtimeStore } from "../lib/realtime-store";
import { realtimeUrl } from "../lib/socket-url";

/**
 * One socket for the life of the app, owned by the shell. Pages ask the store
 * for a room and give it back; they never own the connection, so moving from
 * the landing page to a duel room does not drop the socket and void the room
 * the page just created.
 */
export const useRealtimeConnection = (): void => {
  useEffect(() => {
    const fiber = Effect.runFork(realtimeProgram(realtimeStore, realtimeUrl()));
    return () => {
      Effect.runFork(Fiber.interrupt(fiber));
    };
  }, []);
};
