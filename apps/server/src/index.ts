import { ClientId, LOBBY_ROOM_ID } from "@agent-native/domain";
import type { RoomId } from "@agent-native/domain";
import { createSimulation } from "@agent-native/game-core";
import type { PlayerState } from "@agent-native/game-core";
import {
  decodeClientMessage,
  encodeServerMessage,
} from "@agent-native/protocol";
import type { ServerMessage } from "@agent-native/protocol";
import { BunRuntime } from "@effect/platform-bun";
import { Config, Context, Effect, Layer, Option, Result } from "effect";

import { createInputBuffer } from "./input-buffer";
import { createLedger, LEDGER_FORMAT } from "./ledger";
import type { Ledger } from "./ledger";
import { createTickPacer } from "./tick-pacer";

const TICK_RATE = 20;
const FIXED_DELTA_SECONDS = 1 / TICK_RATE;
const TICK_MS = 1000 / TICK_RATE;

interface SocketData {
  clientId: ClientId;
  roomId: RoomId;
}

type RealtimeSocket = Bun.ServerWebSocket<SocketData>;

export interface ServerResource {
  readonly interval: ReturnType<typeof setInterval>;
  readonly ledger: Ledger | null;
  readonly server: Bun.Server<SocketData>;
  /** Releases every resource the server holds, including the ECS world. */
  readonly dispose: () => Promise<void>;
}

const responseHeaders = {
  "access-control-allow-origin": "*",
  "content-type": "application/json; charset=utf-8",
};

const send = (socket: RealtimeSocket, message: ServerMessage): void => {
  socket.send(encodeServerMessage(message));
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
  const startedAt = Date.now();
  const ledger =
    ledgerDirectory === null ? null : createLedger(ledgerDirectory, startedAt);

  ledger?.record({
    format: LEDGER_FORMAT,
    protocol: 1,
    startedAt,
    tickRate: TICK_RATE,
    type: "ledger.header",
  });

  const simulation = createSimulation<ClientId>();
  const inputs = createInputBuffer<ClientId>();
  const sockets = new Map<ClientId, RealtimeSocket>();
  let sequence = 0;
  let tick = 0;

  const broadcast = (message: ServerMessage): void => {
    const encoded = encodeServerMessage(message);
    for (const socket of sockets.values()) {
      socket.send(encoded);
    }
  };

  const broadcastPresence = (): void => {
    sequence += 1;
    broadcast({
      connected: sockets.size,
      roomId: LOBBY_ROOM_ID,
      seq: sequence,
      type: "room.presence",
      v: 1,
    });
  };

  const server = Bun.serve<SocketData>({
    fetch(request, bunServer) {
      const url = new URL(request.url);

      if (url.pathname === "/health") {
        return Response.json(
          {
            status: "ok",
            runtime: "bun",
            connections: sockets.size,
            tick,
          },
          { headers: responseHeaders }
        );
      }

      if (url.pathname === "/realtime") {
        const upgraded = bunServer.upgrade(request, {
          data: {
            clientId: ClientId.generate(),
            roomId: LOBBY_ROOM_ID,
          },
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
        sockets.delete(socket.data.clientId);
        simulation.removePlayer(socket.data.clientId);
        ledger?.record({
          clientId: socket.data.clientId,
          type: "session.closed",
        });
        broadcastPresence();
      },
      message(socket, rawMessage) {
        const text = rawMessage.toString();
        const decoded = decodeClientMessage(text);

        if (Result.isFailure(decoded)) {
          sequence += 1;
          send(socket, {
            v: 1,
            seq: sequence,
            type: "protocol.error",
            code: "invalid_message",
            message: decoded.failure.message,
          });
          return;
        }

        const message = decoded.success;
        switch (message.type) {
          case "room.join": {
            socket.data.roomId = message.roomId;
            break;
          }
          case "player.input": {
            inputs.capture(socket.data.clientId, message.input);
            break;
          }
          case "ping": {
            sequence += 1;
            send(socket, {
              v: 1,
              seq: sequence,
              type: "pong",
              sentAt: message.sentAt,
            });
            break;
          }
        }
      },
      open(socket) {
        sockets.set(socket.data.clientId, socket);
        simulation.spawnPlayer(socket.data.clientId);
        ledger?.record({
          clientId: socket.data.clientId,
          type: "session.opened",
        });
        sequence += 1;
        send(socket, {
          v: 1,
          seq: sequence,
          type: "session.welcome",
          clientId: socket.data.clientId,
          roomId: socket.data.roomId,
          tickRate: TICK_RATE,
        });
        broadcastPresence();
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

    const frame = inputs.drain();
    let players: readonly PlayerState<ClientId>[] = [];

    for (let step = 0; step < owed; step += 1) {
      // Intent applies at the first boundary of a catch-up run. The Movement
      // trait holds its value, so later steps continue in the same direction
      // rather than consuming the frame a second time. Applying to a client
      // that disconnected inside the window is already a no-op in game-core.
      if (step === 0) {
        for (const entry of frame) {
          simulation.applyInput(entry.clientId, entry.input);
        }
      }

      simulation.step(FIXED_DELTA_SECONDS);
      tick += 1;
      players = simulation.snapshot();

      ledger?.record({
        inputs: step === 0 ? frame : [],
        players,
        tick,
        type: "tick",
      });
    }

    // Snapshots carry whole state rather than deltas, so a catch-up run
    // broadcasts once at the tick it reached. Sending every intermediate world
    // would only have clients overwrite each with the next in the same task.
    sequence += 1;
    broadcast({
      players,
      roomId: LOBBY_ROOM_ID,
      seq: sequence,
      tick,
      type: "world.snapshot",
      v: 1,
    });
  }, TICK_MS);

  const dispose = async (): Promise<void> => {
    clearInterval(interval);
    await server.stop(true);
    await ledger?.close();
    // Koota allocates world ids from a fixed pool of 16 and only returns one on
    // destroy, so a process that builds worlds without releasing them stops
    // being able to build them at all. Harmless while a process held exactly
    // one world for its lifetime; not harmless once a room owns a world.
    simulation.world.destroy();
  };

  return { dispose, interval, ledger, server };
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
