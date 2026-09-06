import { ClientId, makeResumeToken, RoomId } from "@agent-native/domain";
import type { ClientId as ClientIdType } from "@agent-native/domain";
import {
  decodeClientMessage,
  encodeServerMessage,
  SUPERSEDED_CLOSE_CODE,
} from "@agent-native/protocol";
import type { ClientMessage, ServerMessageBody } from "@agent-native/protocol";
import { BunRuntime } from "@effect/platform-bun";
import { Config, Context, Effect, Layer, Option, Result } from "effect";

import { startBot } from "./bot";
import type { Bot } from "./bot";
import { createRoomCodes } from "./codes";
import { createQueue } from "./queue";
import { createResumeRegistry } from "./resume";
import { createRooms } from "./rooms";
import type { CaptureOutcome, RealtimeSocket, Room, SocketData } from "./rooms";
import { createStaticSite } from "./static";
import type { StaticSite } from "./static";
import { createTickPacer } from "./tick-pacer";

const TICK_RATE = 20;
const FIXED_DELTA_SECONDS = 1 / TICK_RATE;
const TICK_MS = 1000 / TICK_RATE;
const ROOM_CAPACITY = 16;
/** Bounded by Koota's pool of 16 world ids; see rooms.ts. */
const MAX_ROOMS = 12;
/** How long a disconnected client may reclaim its identity. */
export const RESUME_TTL_MS = 60_000;
/** How long a duel code stays typeable. Long enough to read it out twice. */
const ROOM_CODE_TTL_MS = 10 * 60_000;
/**
 * A socket that sends nothing for this long is closed by the tick loop. The
 * client pings every five seconds, so this is three missed pings: long enough
 * for a phone to change networks, short enough that an abandoned socket does
 * not hold a duel open. Enforced here rather than by Bun's `idleTimeout`,
 * which did not close a silent socket when tested; Bun's default remains as
 * a backstop.
 */
export const IDLE_TIMEOUT_SECONDS = 20;
/** Sent to a socket the heartbeat gave up on. */
const IDLE_CLOSE_CODE = 4001;

export interface ServerOptions {
  /** `0` asks the host for an ephemeral port. */
  readonly port: number;
  readonly ledgerDirectory: string | null;
  /** How long a disconnected client may reclaim its identity. */
  readonly resumeTtlMs: number;
  /** Seconds of silence before a socket is closed. */
  readonly idleTimeoutSeconds: number;
  /**
   * The built web app, served on this origin when present. Null in tests and
   * in development, where Vite serves the page and proxies the socket here.
   */
  readonly site: StaticSite | null;
}

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
export const createRealtimeServer = ({
  idleTimeoutSeconds,
  ledgerDirectory,
  port,
  resumeTtlMs,
  site,
}: ServerOptions): ServerResource => {
  const rooms = createRooms({
    capacity: ROOM_CAPACITY,
    ledgerDirectory,
    maxRooms: MAX_ROOMS,
    tickRate: TICK_RATE,
  });

  const claims = createResumeRegistry(resumeTtlMs);
  const codes = createRoomCodes(ROOM_CODE_TTL_MS);
  const queue = createQueue<RealtimeSocket>();
  /** The live bot in each bot room, by room. */
  const bots = new Map<RoomId, Bot>();
  /** Where a bot connects. Known once the server has bound its port. */
  let botUrl: string | null = null;
  /** The socket each identity currently belongs to. */
  const owners = new Map<ClientIdType, RealtimeSocket>();

  const owns = (socket: RealtimeSocket): boolean =>
    owners.get(socket.data.clientId) === socket;

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
    queue.dequeue(socket);
    const room = rooms.leave(socket);
    if (room !== null) {
      announcePresence(room);
      // A bot alone in a room has nobody to play; dismissing it empties the
      // room, which is then collected as any empty room is.
      const bot = bots.get(room.id);
      if (bot !== undefined && room.sockets.size === 1) {
        bots.delete(room.id);
        bot.stop();
      }
    }
  };

  /** Names a new duel room and tells the socket where it is. */
  const openDuel = (socket: RealtimeSocket, withBot: boolean) => {
    const roomId = RoomId.generate();
    const code = codes.mint(roomId, withBot);
    send(socket, { code, roomId, type: "duel.created", v: 1 });
    return { code, roomId };
  };

  /** Reports why intent was not taken, or nothing when it was. */
  const refuse = (socket: RealtimeSocket, outcome: CaptureOutcome): void => {
    switch (outcome) {
      case "captured": {
        return;
      }
      case "not_in_room": {
        send(socket, {
          code: "not_in_room",
          message: "Input arrived before a room was joined",
          type: "protocol.error",
          v: 1,
        });
        return;
      }
      case "wrong_room_kind": {
        send(socket, {
          code: "wrong_room_kind",
          message: "This room does not run the rules that input belongs to",
          type: "protocol.error",
          v: 1,
        });
      }
    }
  };

  /**
   * Moves `clientId` onto `socket`. A socket still holding it is one whose
   * drop the client noticed before the server did: it is put out of its room
   * and closed with a code that says why, so that client does not present the
   * same claim again. The entity respawns under the new socket, which is the
   * policy resume has throughout - identity comes back, position does not.
   */
  const adopt = (socket: RealtimeSocket, clientId: ClientIdType): void => {
    const stale = owners.get(clientId);
    if (stale !== undefined && stale !== socket) {
      departed(stale);
      stale.close(SUPERSEDED_CLOSE_CODE, "identity resumed elsewhere");
    }
    // The welcome identity was never used and nothing may reclaim it.
    claims.forget(socket.data.clientId);
    owners.delete(socket.data.clientId);
    socket.data.clientId = clientId;
    owners.set(clientId, socket);
    // The claim rolls over to this socket's token, so the client resumes next
    // time with the identity it has and the token it was most recently given.
    claims.remember(clientId, socket.data.resumeToken);
  };

  const handleJoin = (
    socket: RealtimeSocket,
    message: Extract<ClientMessage, { readonly type: "room.join" }>
  ): void => {
    // An identity is reclaimed before the join, so the entity spawns
    // under the id the client keeps rather than one it must adopt.
    if (
      socket.data.roomId === null &&
      message.resume !== undefined &&
      claims.reclaim(message.resume.clientId, message.resume.resumeToken)
    ) {
      adopt(socket, message.resume.clientId);
    }

    // A room keeps the rules it was created with; a new one runs a
    // duel only if its id was minted for one.
    const kind =
      rooms.get(message.roomId)?.kind ??
      (codes.isDuel(message.roomId) ? "duel" : "lobby");
    const outcome = rooms.join(socket, message.roomId, kind);
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

    queue.dequeue(socket);
    send(socket, {
      capacity: outcome.room.capacity,
      clientId: socket.data.clientId,
      connected: outcome.room.sockets.size,
      roomId: outcome.room.id,
      type: "room.joined",
      v: 1,
    });
    announcePresence(outcome.room);
    // A bot room seats its bot whenever a human is in and it is not already:
    // on the first join, and again after a leave dismissed it.
    if (
      botUrl !== null &&
      codes.wantsBot(outcome.room.id) &&
      !bots.has(outcome.room.id)
    ) {
      bots.set(
        outcome.room.id,
        startBot({ roomId: outcome.room.id, url: botUrl })
      );
    }
  };

  const handleQueue = (socket: RealtimeSocket): void => {
    // Waiting is not being in a room; a socket that queues from a
    // room leaves it first, and never silently.
    if (socket.data.roomId !== null) {
      departed(socket);
    }
    const pair = queue.enqueue(socket);
    if (pair === null) {
      send(socket, { seconds: 0, type: "duel.waiting", v: 1 });
      return;
    }
    const roomId = RoomId.generate();
    const code = codes.mint(roomId);
    for (const member of pair) {
      send(member, { code, roomId, type: "duel.matched", v: 1 });
    }
  };

  const server = Bun.serve<SocketData>({
    async fetch(request, bunServer) {
      const url = new URL(request.url);

      if (url.pathname === "/health") {
        return Response.json(
          {
            status: "ok",
            runtime: "bun",
            rooms: rooms.count(),
            site: site !== null,
          },
          { headers: responseHeaders }
        );
      }

      if (url.pathname === "/realtime") {
        const upgraded = bunServer.upgrade(request, {
          data: {
            clientId: ClientId.generate(),
            lastSeenAt: Date.now(),
            resumeToken: makeResumeToken(),
            roomId: null,
            seq: 0,
          },
        });
        return upgraded
          ? undefined
          : Response.json(
              { error: "websocket_upgrade_failed" },
              { status: 400, headers: responseHeaders }
            );
      }

      if (site !== null) {
        return await site.respond(url.pathname);
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
        // A superseded socket no longer owns its identity; the one that took
        // it over is the one whose departure counts.
        if (!owns(socket)) {
          return;
        }
        owners.delete(socket.data.clientId);
        claims.release(socket.data.clientId);
        departed(socket);
      },
      message(socket, rawMessage) {
        socket.data.lastSeenAt = Date.now();
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
            handleJoin(socket, message);
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
            refuse(socket, rooms.capture(socket, message.input));
            break;
          }
          case "duel.create": {
            openDuel(socket, false);
            break;
          }
          case "duel.bot": {
            openDuel(socket, true);
            break;
          }
          case "duel.queue": {
            handleQueue(socket);
            break;
          }
          case "duel.dequeue": {
            queue.dequeue(socket);
            break;
          }
          case "duel.join": {
            const roomId = codes.lookup(message.code);
            if (roomId === undefined) {
              send(socket, {
                code: message.code,
                type: "duel.notFound",
                v: 1,
              });
            } else {
              send(socket, { roomId, type: "duel.found", v: 1 });
            }
            break;
          }
          case "duel.move": {
            refuse(
              socket,
              rooms.captureDuel(socket, { move: message.move.target })
            );
            break;
          }
          case "duel.fire": {
            refuse(
              socket,
              rooms.captureDuel(socket, { fire: message.fire.angle })
            );
            break;
          }
          case "duel.rematch": {
            refuse(socket, rooms.captureDuel(socket, { rematch: true }));
            break;
          }
          case "ping": {
            send(socket, { sentAt: message.sentAt, type: "pong", v: 1 });
            break;
          }
        }
      },
      open(socket) {
        owners.set(socket.data.clientId, socket);
        claims.remember(socket.data.clientId, socket.data.resumeToken);
        // Identity only. Membership begins at `room.join`, so this names no
        // room: a connection is somewhere only once it has asked to be.
        send(socket, {
          clientId: socket.data.clientId,
          resumeToken: socket.data.resumeToken,
          tickRate: TICK_RATE,
          type: "session.welcome",
          v: 1,
        });
      },
    },
  });

  botUrl = `ws://127.0.0.1:${server.port}/realtime`;

  const pacer = createTickPacer(TICK_MS);
  let previousFiring = performance.now();
  let ticksSinceQueueReport = 0;

  const interval = setInterval(() => {
    const now = performance.now();
    const owed = pacer.advance(now - previousFiring);
    previousFiring = now;

    if (owed === 0) {
      return;
    }

    // Once a second, tell each waiter how long it has been; the client
    // decides when that is long enough to offer the bot.
    ticksSinceQueueReport += owed;
    if (ticksSinceQueueReport >= TICK_RATE) {
      ticksSinceQueueReport = 0;
      for (const { entry, seconds } of queue.waiting()) {
        send(entry, { seconds, type: "duel.waiting", v: 1 });
      }
      // The heartbeat. A socket that has said nothing for the timeout is
      // closed; its close handler then leaves whatever room it was in.
      const deadline = Date.now() - idleTimeoutSeconds * 1000;
      for (const socket of owners.values()) {
        if (socket.data.lastSeenAt < deadline) {
          socket.close(IDLE_CLOSE_CODE, "no heartbeat");
        }
      }
    }

    // One clock for every room. N intervals would be N drifting clocks and N
    // teardown paths to miss; the cost of walking a map of at most MAX_ROOMS
    // entries at 20Hz is nil.
    for (const advanced of rooms.advance(owed, FIXED_DELTA_SECONDS)) {
      // Snapshots carry whole state rather than deltas, so a catch-up run
      // broadcasts once at the tick it reached.
      const { room } = advanced;
      if (advanced.kind === "duel") {
        broadcast(room, {
          ...advanced.snapshot,
          roomId: room.id,
          tick: room.tick,
          type: "duel.snapshot",
          v: 1,
        });
      } else {
        broadcast(room, {
          players: advanced.players,
          roomId: room.id,
          tick: room.tick,
          type: "world.snapshot",
          v: 1,
        });
      }
    }
  }, TICK_MS);

  const dispose = async (): Promise<void> => {
    clearInterval(interval);
    for (const bot of bots.values()) {
      bot.stop();
    }
    bots.clear();
    owners.clear();
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
      // Where `vite build` puts the page. Present in the container, absent in
      // development, and the server is honest about which by serving the
      // JSON index it always had when there is nothing to serve.
      const webDirectory = yield* Config.string("WEB_DIST").pipe(
        Config.withDefault(`${import.meta.dir}/../../web/dist`)
      );
      const site = yield* Effect.promise(
        async () => await createStaticSite(webDirectory)
      );
      const resource = yield* Effect.acquireRelease(
        Effect.sync(() =>
          createRealtimeServer({
            idleTimeoutSeconds: IDLE_TIMEOUT_SECONDS,
            ledgerDirectory: Option.getOrNull(ledgerDirectory),
            port,
            resumeTtlMs: RESUME_TTL_MS,
            site,
          })
        ),
        (running) =>
          Effect.promise(async () => {
            await running.dispose();
          })
      );
      const url = `http://localhost:${resource.server.port}`;
      yield* Effect.logInfo(
        `HTTP + WebSocket server listening at ${url}${site === null ? "" : `, serving ${webDirectory}`}`
      );
      return RealtimeServer.of({ url });
    })
  );
}

// Guarded so importing this module does not start listening. `replay.ts` uses
// the same shape for the same reason.
if (import.meta.main) {
  BunRuntime.runMain(Layer.launch(RealtimeServer.layer));
}
