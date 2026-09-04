import { ClientId, LOBBY_ROOM_ID } from "@agent-native/domain";
import type { RoomId } from "@agent-native/domain";
import { createSimulation } from "@agent-native/game-core";
import {
  decodeClientMessage,
  encodeServerMessage,
} from "@agent-native/protocol";
import type { ServerMessage } from "@agent-native/protocol";
import { BunRuntime } from "@effect/platform-bun";
import { Config, Context, Effect, Layer, Result } from "effect";

const TICK_RATE = 20;
const FIXED_DELTA_SECONDS = 1 / TICK_RATE;

interface SocketData {
  clientId: ClientId;
  roomId: RoomId;
}

type RealtimeSocket = Bun.ServerWebSocket<SocketData>;

interface ServerResource {
  readonly interval: ReturnType<typeof setInterval>;
  readonly server: Bun.Server<SocketData>;
}

const responseHeaders = {
  "access-control-allow-origin": "*",
  "content-type": "application/json; charset=utf-8",
};

const send = (socket: RealtimeSocket, message: ServerMessage): void => {
  socket.send(encodeServerMessage(message));
};

const createRealtimeServer = (port: number): ServerResource => {
  const simulation = createSimulation<ClientId>();
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
            simulation.applyInput(socket.data.clientId, message.input);
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

  const interval = setInterval(() => {
    simulation.step(FIXED_DELTA_SECONDS);
    tick += 1;
    sequence += 1;
    broadcast({
      players: simulation.snapshot(),
      roomId: LOBBY_ROOM_ID,
      seq: sequence,
      tick,
      type: "world.snapshot",
      v: 1,
    });
  }, 1000 / TICK_RATE);

  return { interval, server };
};

class RealtimeServer extends Context.Service<
  RealtimeServer,
  { readonly url: string }
>()("agent-native/server/RealtimeServer") {
  static readonly layer = Layer.effect(
    RealtimeServer,
    Effect.gen(function* layer() {
      const port = yield* Config.number("PORT").pipe(Config.withDefault(3001));
      const resource = yield* Effect.acquireRelease(
        Effect.sync(() => createRealtimeServer(port)),
        ({ interval, server }) =>
          Effect.promise(async () => {
            clearInterval(interval);
            await server.stop(true);
          })
      );
      const url = `http://localhost:${resource.server.port}`;
      yield* Effect.logInfo(`HTTP + WebSocket server listening at ${url}`);
      return RealtimeServer.of({ url });
    })
  );
}

BunRuntime.runMain(Layer.launch(RealtimeServer.layer));
