import { PROTOCOL_VERSION } from "@agent-native/domain";
import type {
  ClientId,
  MovementInput,
  ResumeToken,
  RoomId,
} from "@agent-native/domain";
import { createSimulation } from "@agent-native/game-core";
import type { PlayerState, Simulation } from "@agent-native/game-core";
import type { ServerMessage } from "@agent-native/protocol";

import { createInputBuffer } from "./input-buffer";
import type { InputBuffer } from "./input-buffer";
import { createLedger, LEDGER_FORMAT } from "./ledger";
import type { Ledger } from "./ledger";

/**
 * Room membership and per-room world state.
 *
 * Kept out of index.ts so it can be driven without binding a socket, and so the
 * lifecycle rules live next to the state they protect rather than inside a
 * websocket handler.
 */

export interface SocketData {
  clientId: ClientId;
  /** Proves a later connection may reclaim `clientId`. Issued with it. */
  readonly resumeToken: ResumeToken;
  /** Null until `room.join` succeeds. A roomless socket receives no world. */
  roomId: RoomId | null;
  /** Messages sent on this connection. Only `send` writes it. */
  seq: number;
}

export type RealtimeSocket = Bun.ServerWebSocket<SocketData>;

type RejectionReason = Extract<
  ServerMessage,
  { readonly type: "room.rejected" }
>["reason"];

export interface Room {
  readonly id: RoomId;
  readonly simulation: Simulation<ClientId>;
  readonly inputs: InputBuffer<ClientId>;
  readonly sockets: Set<RealtimeSocket>;
  readonly ledger: Ledger | null;
  readonly capacity: number;
  tick: number;
}

type JoinOutcome =
  | { readonly kind: "joined"; readonly room: Room }
  | { readonly kind: "rejected"; readonly reason: RejectionReason };

interface AdvancedRoom {
  readonly room: Room;
  readonly players: readonly PlayerState<ClientId>[];
}

export interface Rooms {
  readonly join: (socket: RealtimeSocket, roomId: RoomId) => JoinOutcome;
  readonly leave: (socket: RealtimeSocket) => Room | null;
  readonly capture: (socket: RealtimeSocket, input: MovementInput) => boolean;
  readonly advance: (ticks: number, deltaSeconds: number) => AdvancedRoom[];
  readonly get: (roomId: RoomId) => Room | undefined;
  readonly count: () => number;
  readonly disposeAll: () => Promise<void>;
}

export interface RoomsOptions {
  readonly tickRate: number;
  readonly capacity: number;
  readonly ledgerDirectory: string | null;
  /**
   * Live rooms allowed at once.
   *
   * Not a policy number: Koota allocates world ids from a fixed pool of 16 and
   * a room owns a world, so the ceiling is a property of the ECS. Kept below it
   * so a replay or a test can still build a world while rooms are live.
   */
  readonly maxRooms: number;
}

export const createRooms = (options: RoomsOptions): Rooms => {
  const rooms = new Map<RoomId, Room>();

  const create = (roomId: RoomId): Room => {
    const startedAt = Date.now();
    const ledger =
      options.ledgerDirectory === null
        ? null
        : createLedger(options.ledgerDirectory, roomId, startedAt);

    ledger?.record({
      format: LEDGER_FORMAT,
      protocol: PROTOCOL_VERSION,
      roomId,
      startedAt,
      tickRate: options.tickRate,
      type: "ledger.header",
    });

    return {
      capacity: options.capacity,
      id: roomId,
      inputs: createInputBuffer<ClientId>(),
      ledger,
      simulation: createSimulation<ClientId>(),
      sockets: new Set<RealtimeSocket>(),
      tick: 0,
    };
  };

  const destroy = (room: Room): void => {
    rooms.delete(room.id);
    void room.ledger?.close();
    // Returns the world id to Koota's pool of 16. Without it a server stops
    // being able to open rooms after the sixteenth, whatever else it releases.
    room.simulation.dispose();
  };

  const join = (socket: RealtimeSocket, roomId: RoomId): JoinOutcome => {
    if (socket.data.roomId !== null) {
      // Never a silent move: an unnoticed rejoin is a client bug that would
      // otherwise present as a world quietly changing underneath the player.
      return { kind: "rejected", reason: "already_in_room" };
    }

    const existing = rooms.get(roomId);
    if (existing === undefined && rooms.size >= options.maxRooms) {
      return { kind: "rejected", reason: "server_full" };
    }

    const room = existing ?? create(roomId);
    if (room.sockets.size >= room.capacity) {
      if (existing === undefined) {
        destroy(room);
      }
      return { kind: "rejected", reason: "room_full" };
    }

    rooms.set(roomId, room);
    room.sockets.add(socket);
    room.simulation.spawnPlayer(socket.data.clientId);
    room.ledger?.record({
      clientId: socket.data.clientId,
      type: "session.opened",
    });
    socket.data.roomId = roomId;

    return { kind: "joined", room };
  };

  /**
   * The one way a socket leaves, used by both `room.leave` and a closed socket.
   * Two implementations of this is how an entity outlives its connection.
   */
  const leave = (socket: RealtimeSocket): Room | null => {
    const { roomId } = socket.data;
    if (roomId === null) {
      return null;
    }
    const room = rooms.get(roomId);
    socket.data.roomId = null;
    if (room === undefined) {
      return null;
    }

    room.sockets.delete(socket);
    room.simulation.removePlayer(socket.data.clientId);
    room.ledger?.record({
      clientId: socket.data.clientId,
      type: "session.closed",
    });

    // Collected the moment it empties. There is no state worth preserving once
    // every occupant has gone, and a linger would need a policy for how long a
    // vacated world persists that nothing here can answer.
    if (room.sockets.size === 0) {
      destroy(room);
    }
    return room;
  };

  const capture = (socket: RealtimeSocket, input: MovementInput): boolean => {
    const { roomId } = socket.data;
    if (roomId === null) {
      return false;
    }
    rooms.get(roomId)?.inputs.capture(socket.data.clientId, input);
    return true;
  };

  const advance = (ticks: number, deltaSeconds: number): AdvancedRoom[] => {
    const advanced: AdvancedRoom[] = [];

    for (const room of rooms.values()) {
      const frame = room.inputs.drain();
      let players: readonly PlayerState<ClientId>[] = [];

      for (let step = 0; step < ticks; step += 1) {
        // Intent applies at the first boundary of a catch-up run. The Movement
        // trait holds its value, so later steps continue in the same direction
        // rather than consuming the frame a second time.
        if (step === 0) {
          for (const entry of frame) {
            room.simulation.applyInput(entry.clientId, entry.input);
          }
        }

        room.simulation.step(deltaSeconds);
        room.tick += 1;
        players = room.simulation.snapshot();

        room.ledger?.record({
          inputs: step === 0 ? frame : [],
          players,
          tick: room.tick,
          type: "tick",
        });
      }

      advanced.push({ players, room });
    }

    return advanced;
  };

  return {
    advance,
    capture,
    count: () => rooms.size,
    disposeAll: async () => {
      const closing = [...rooms.values()].map(
        async (room) => await room.ledger?.close()
      );
      for (const room of rooms.values()) {
        rooms.delete(room.id);
        room.simulation.dispose();
      }
      await Promise.all(closing);
    },
    get: (roomId) => rooms.get(roomId),
    join,
    leave,
  };
};
