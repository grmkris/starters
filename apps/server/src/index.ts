import { ClientId, makeResumeToken } from "@agent-native/domain";
import type {
  ClientId as ClientIdType,
  ResumeToken,
} from "@agent-native/domain";
import {
  decodeClientMessage,
  encodeServerMessage,
} from "@agent-native/protocol";
import type { ServerMessageBody } from "@agent-native/protocol";
import { BunRuntime } from "@effect/platform-bun";
import { Config, Context, Effect, Layer, Option, Result } from "effect";

import { createRooms } from "./rooms";
import type { RealtimeSocket, Room, SocketData } from "./rooms";
import { createTickPacer } from "./tick-pacer";

const TICK_RATE = 20;
const FIXED_DELTA_SECONDS = 1 / TICK_RATE;
const TICK_MS = 1000 / TICK_RATE;
const ROOM_CAPACITY = 16;
/** Bounded by Koota's pool of 16 world ids; see rooms.ts. */
const MAX_ROOMS = 12;
/** How long a disconnected client may reclaim its identity. */
const RESUME_TTL_MS = 60_000;

export interface ServerResource {
  readonly interval: ReturnType<typeof setInterval>;
  readonly server: Bun.Server<SocketData>;
  /** Releases every resource the server holds, including the ECS world. */
  readonly dispose: () => Promise<void>;
}

const responseHeaders = {
  "access-control-allow-origin": "*",
  "content-type": "application/json; charset=utf-8",
};

/**
 * Stamps the sequence number as it sends.
 *
 * `seq` counts messages on one connection, so only the sender can know it.
 * Taking a body without one means no caller can supply a wrong value and the
 * counter has exactly one writer. Over a single ordered socket a gap is
 * therefore always a bug rather than expected loss.
 */
const send = (socket: RealtimeSocket, body: ServerMessageBody): void => {
  socket.data.seq += 1;
  socket.send(encodeServerMessage({ ...body, seq: socket.data.seq }));
};

/**
 * Builds a running server. Exported so a test can drive the real thing on an
 * ephemeral port: pass `port: 0` and read the assigned port back from
 * `resource.server.port`.
 */
export const createRealtimeServer = (
  port: number,
  ledgerDirectory: string | null
): ServerResource => {
  const rooms = createRooms({
    capacity: ROOM_CAPACITY,
    ledgerDirectory,
    maxRooms: MAX_ROOMS,
    tickRate: TICK_RATE,
  });

  /**
   * Identities a disconnected client may reclaim, and the secret that proves
   * the claim. Entries expire so a token cannot be redeemed indefinitely and
   * the map cannot grow without bound.
   */
  const resumable = new Map<
    ClientIdType,
    { readonly token: ResumeToken; readonly expiresAt: number }
  >();

  const rememberIdentity = (
    socket: RealtimeSocket,
    token: ResumeToken
  ): void => {
    resumable.set(socket.data.clientId, {
      expiresAt: Date.now() + RESUME_TTL_MS,
      token,
    });
  };

  const reclaim = (clientId: ClientIdType, token: ResumeToken): boolean => {
    const entry = resumable.get(clientId);
    if (entry === undefined) {
      return false;
    }
    resumable.delete(clientId);
    return entry.token === token && entry.expiresAt > Date.now();
  };

  const broadcast = (room: Room, body: ServerMessageBody): void => {
    for (const member of room.sockets) {
      send(member, body);
    }
  };

  const announcePresence = (room: Room): void => {
    broadcast(room, {
      connected: room.sockets.size,
      roomId: room.id,
      type: "room.presence",
      v: 1,
    });
  };

  const departed = (socket: RealtimeSocket): void => {
    const room = rooms.leave(socket);
    if (room !== null) {
      announcePresence(room);
    }
  };

  const server = Bun.serve<SocketData>({
    fetch(request, bunServer) {
      const url = new URL(request.url);

      if (url.pathname === "/health") {
        return Response.json(
          {
            status: "ok",
            runtime: "bun",
            rooms: rooms.count(),
          },
          { headers: responseHeaders }
        );
      }

      if (url.pathname === "/realtime") {
        const upgraded = bunServer.upgrade(request, {
          data: { clientId: ClientId.generate(), roomId: null, seq: 0 },
        });
        return upgraded
          ? undefined
          : Response.json(
              { error: "websocket_upgrade_failed" },
              { status: 400, headers: responseHeaders }
            );
      }

      return Response.json(
        {
          name: "agent-native-server",
          health: "/health",
          realtime: "/realtime",
        },
        { headers: responseHeaders }
      );
    },
    port,
    websocket: {
      close(socket) {
        departed(socket);
      },
      message(socket, rawMessage) {
        const decoded = decodeClientMessage(rawMessage.toString());

        if (Result.isFailure(decoded)) {
          send(socket, {
            code: "invalid_message",
            message: decoded.failure.message,
            type: "protocol.error",
            v: 1,
          });
          return;
        }

        const message = decoded.success;
        switch (message.type) {
          case "room.join": {
            // An identity is reclaimed before the join, so the entity spawns
            // under the id the client keeps rather than one it must adopt.
            if (
              message.resume !== undefined &&
              reclaim(message.resume.clientId, message.resume.resumeToken)
            ) {
              socket.data.clientId = message.resume.clientId;
            }

            const outcome = rooms.join(socket, message.roomId);
            if (outcome.kind === "rejected") {
              // Membership failed, not the transport: the socket stays open so
              // a client can pick another room without a reconnect.
              send(socket, {
                reason: outcome.reason,
                roomId: message.roomId,
                type: "room.rejected",
                v: 1,
              });
              return;
            }

            send(socket, {
              capacity: outcome.room.capacity,
              connected: outcome.room.sockets.size,
              roomId: outcome.room.id,
              type: "room.joined",
              v: 1,
            });
            announcePresence(outcome.room);
            break;
          }
          case "room.leave": {
            const { roomId } = socket.data;
            if (roomId === null) {
              send(socket, {
                code: "not_in_room",
                message: "This connection is not in a room",
                type: "protocol.error",
                v: 1,
              });
              return;
            }
            departed(socket);
            send(socket, {
              reason: "client_request",
              roomId,
              type: "room.left",
              v: 1,
            });
            break;
          }
          case "player.input": {
            if (!rooms.capture(socket, message.input)) {
              send(socket, {
                code: "not_in_room",
                message: "Input arrived before a room was joined",
                type: "protocol.error",
                v: 1,
              });
            }
            break;
          }
          case "ping": {
            send(socket, { sentAt: message.sentAt, type: "pong", v: 1 });
            break;
          }
        }
      },
      open(socket) {
        const token = makeResumeToken();
        rememberIdentity(socket, token);
        // Identity only. Membership begins at `room.join`, so this names no
        // room: a connection is somewhere only once it has asked to be.
        send(socket, {
          clientId: socket.data.clientId,
          resumeToken: token,
          tickRate: TICK_RATE,
          type: "session.welcome",
          v: 1,
        });
      },
    },
  });

  const pacer = createTickPacer(TICK_MS);
  let previousFiring = performance.now();

  const interval = setInterval(() => {
    const now = performance.now();
    const owed = pacer.advance(now - previousFiring);
    previousFiring = now;

    if (owed === 0) {
      return;
    }

    // One clock for every room. N intervals would be N drifting clocks and N
    // teardown paths to miss; the cost of walking a map of at most MAX_ROOMS
    // entries at 20Hz is nil.
    for (const { players, room } of rooms.advance(owed, FIXED_DELTA_SECONDS)) {
      // Snapshots carry whole state rather than deltas, so a catch-up run
      // broadcasts once at the tick it reached.
      broadcast(room, {
        players,
        roomId: room.id,
        tick: room.tick,
        type: "world.snapshot",
        v: 1,
      });
    }
  }, TICK_MS);

  const dispose = async (): Promise<void> => {
    clearInterval(interval);
    await server.stop(true);
    await rooms.disposeAll();
  };

  return { dispose, interval, server };
};

class RealtimeServer extends Context.Service<
  RealtimeServer,
  { readonly url: string }
>()("agent-native/server/RealtimeServer") {
  static readonly layer = Layer.effect(
    RealtimeServer,
    Effect.gen(function* layer() {
      const port = yield* Config.number("PORT").pipe(Config.withDefault(3001));
      // Recording is off unless asked for. A reference implementation should be
      // able to show its own determinism on demand without every `bun dev` in
      // every clone leaving ndjson behind.
      const ledgerDirectory = yield* Config.string("LEDGER_DIR").pipe(
        Config.option
      );
      const resource = yield* Effect.acquireRelease(
        Effect.sync(() =>
          createRealtimeServer(port, Option.getOrNull(ledgerDirectory))
        ),
        (running) =>
          Effect.promise(async () => {
            await running.dispose();
          })
      );
      const url = `http://localhost:${resource.server.port}`;
      yield* Effect.logInfo(`HTTP + WebSocket server listening at ${url}`);
      return RealtimeServer.of({ url });
    })
  );
}

// Guarded so importing this module does not start listening. `replay.ts` uses
// the same shape for the same reason.
if (import.meta.main) {
  BunRuntime.runMain(Layer.launch(RealtimeServer.layer));
}
