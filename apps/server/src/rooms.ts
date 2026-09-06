import { PROTOCOL_VERSION } from "@agent-native/domain";
import type {
  ClientId,
  DuelSnapshot,
  MovementInput,
  ResumeToken,
  RoomId,
} from "@agent-native/domain";
import {
  createDuelSimulation,
  createSimulation,
} from "@agent-native/game-core";
import type {
  DuelSimulation,
  PlayerState,
  Simulation,
} from "@agent-native/game-core";
import type { ServerMessage } from "@agent-native/protocol";

import { createDuelInputBuffer } from "./duel-input";
import type { DuelInputBuffer } from "./duel-input";
import { createInputBuffer } from "./input-buffer";
import type { InputBuffer } from "./input-buffer";
import { createLedger, LEDGER_FORMAT } from "./ledger";
import type { Ledger, RoomKind } from "./ledger";

/**
 * Room membership and per-room world state.
 *
 * Kept out of index.ts so it can be driven without binding a socket, and so the
 * lifecycle rules live next to the state they protect rather than inside a
 * websocket handler.
 *
 * A room has a kind, fixed when it is created, that says which rules run in
 * it: the free-roam lobby world, or a duel. The kind decides the capacity,
 * the input that is legal, what the ledger records, and what is broadcast.
 */

export interface SocketData {
  clientId: ClientId;
  /** Proves a later connection may reclaim `clientId`. Issued with it. */
  readonly resumeToken: ResumeToken;
  /** Null until `room.join` succeeds. A roomless socket receives no world. */
  roomId: RoomId | null;
  /** Messages sent on this connection. Only `send` writes it. */
  seq: number;
  /** When this connection last said anything; the heartbeat's evidence. */
  lastSeenAt: number;
}

export type RealtimeSocket = Bun.ServerWebSocket<SocketData>;

type RejectionReason = Extract<
  ServerMessage,
  { readonly type: "room.rejected" }
>["reason"];

interface RoomBase {
  readonly id: RoomId;
  readonly sockets: Set<RealtimeSocket>;
  readonly ledger: Ledger | null;
  readonly capacity: number;
  tick: number;
}

interface LobbyRoom extends RoomBase {
  readonly kind: "lobby";
  readonly simulation: Simulation<ClientId>;
  readonly inputs: InputBuffer<ClientId>;
}

interface DuelRoom extends RoomBase {
  readonly kind: "duel";
  readonly duel: DuelSimulation<ClientId>;
  readonly inputs: DuelInputBuffer<ClientId>;
}

export type Room = LobbyRoom | DuelRoom;

type JoinOutcome =
  | { readonly kind: "joined"; readonly room: Room }
  | { readonly kind: "rejected"; readonly reason: RejectionReason };

/** Why intent was not taken: no room, or a room running other rules. */
export type CaptureOutcome = "captured" | "not_in_room" | "wrong_room_kind";

type AdvancedRoom =
  | {
      readonly kind: "lobby";
      readonly room: LobbyRoom;
      readonly players: readonly PlayerState<ClientId>[];
    }
  | {
      readonly kind: "duel";
      readonly room: DuelRoom;
      readonly snapshot: DuelSnapshot;
    };

interface DuelIntent {
  readonly fire?: number;
  readonly move?: number;
  readonly rematch?: boolean;
}

export interface Rooms {
  readonly join: (
    socket: RealtimeSocket,
    roomId: RoomId,
    kind: RoomKind
  ) => JoinOutcome;
  readonly leave: (socket: RealtimeSocket) => Room | null;
  readonly capture: (
    socket: RealtimeSocket,
    input: MovementInput
  ) => CaptureOutcome;
  readonly captureDuel: (
    socket: RealtimeSocket,
    intent: DuelIntent
  ) => CaptureOutcome;
  readonly advance: (ticks: number, deltaSeconds: number) => AdvancedRoom[];
  readonly get: (roomId: RoomId) => Room | undefined;
  readonly count: () => number;
  readonly disposeAll: () => Promise<void>;
}

export interface RoomsOptions {
  readonly tickRate: number;
  /** Occupants of a lobby room. A duel always seats two. */
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

const DUEL_CAPACITY = 2;

const disposeWorld = (room: Room): void => {
  // Returns the world id to Koota's pool of 16. Without it a server stops
  // being able to open rooms after the sixteenth, whatever else it releases.
  if (room.kind === "duel") {
    room.duel.dispose();
  } else {
    room.simulation.dispose();
  }
};

const seat = (room: Room, clientId: ClientId): void => {
  if (room.kind === "duel") {
    room.duel.join(clientId);
  } else {
    room.simulation.spawnPlayer(clientId);
  }
};

const unseat = (room: Room, clientId: ClientId): void => {
  if (room.kind === "duel") {
    room.duel.leave(clientId);
  } else {
    room.simulation.removePlayer(clientId);
  }
};

const advanceLobby = (
  room: LobbyRoom,
  ticks: number,
  deltaSeconds: number
): AdvancedRoom => {
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

  return { kind: "lobby", players, room };
};

const advanceDuel = (
  room: DuelRoom,
  ticks: number,
  deltaSeconds: number
): AdvancedRoom => {
  const frame = room.inputs.drain();
  let snapshot: DuelSnapshot = room.duel.snapshot();

  for (let step = 0; step < ticks; step += 1) {
    if (step === 0) {
      for (const entry of frame) {
        if (entry.move !== null) {
          room.duel.move(entry.clientId, entry.move);
        }
        if (entry.fire !== null) {
          room.duel.fire(entry.clientId, entry.fire);
        }
        if (entry.rematch) {
          room.duel.rematch(entry.clientId);
        }
      }
    }

    room.duel.step(deltaSeconds);
    room.tick += 1;
    snapshot = room.duel.snapshot();

    room.ledger?.record({
      inputs: step === 0 ? frame : [],
      snapshot,
      tick: room.tick,
      type: "duel.tick",
    });
  }

  return { kind: "duel", room, snapshot };
};

export const createRooms = (options: RoomsOptions): Rooms => {
  const rooms = new Map<RoomId, Room>();

  const create = (roomId: RoomId, kind: RoomKind): Room => {
    const startedAt = Date.now();
    const ledger =
      options.ledgerDirectory === null
        ? null
        : createLedger(options.ledgerDirectory, roomId, startedAt);

    ledger?.record({
      format: LEDGER_FORMAT,
      kind,
      protocol: PROTOCOL_VERSION,
      roomId,
      startedAt,
      tickRate: options.tickRate,
      type: "ledger.header",
    });

    const base = {
      id: roomId,
      ledger,
      sockets: new Set<RealtimeSocket>(),
      tick: 0,
    };

    return kind === "duel"
      ? {
          ...base,
          capacity: DUEL_CAPACITY,
          duel: createDuelSimulation<ClientId>(),
          inputs: createDuelInputBuffer<ClientId>(),
          kind: "duel",
        }
      : {
          ...base,
          capacity: options.capacity,
          inputs: createInputBuffer<ClientId>(),
          kind: "lobby",
          simulation: createSimulation<ClientId>(),
        };
  };

  const destroy = (room: Room): void => {
    rooms.delete(room.id);
    void room.ledger?.close();
    disposeWorld(room);
  };

  const join = (
    socket: RealtimeSocket,
    roomId: RoomId,
    kind: RoomKind
  ): JoinOutcome => {
    if (socket.data.roomId !== null) {
      // Never a silent move: an unnoticed rejoin is a client bug that would
      // otherwise present as a world quietly changing underneath the player.
      return { kind: "rejected", reason: "already_in_room" };
    }

    const existing = rooms.get(roomId);
    if (existing === undefined && rooms.size >= options.maxRooms) {
      return { kind: "rejected", reason: "server_full" };
    }

    // An existing room keeps the rules it was created with, whatever a later
    // joiner believes them to be.
    const room = existing ?? create(roomId, kind);
    if (room.sockets.size >= room.capacity) {
      if (existing === undefined) {
        destroy(room);
      }
      return { kind: "rejected", reason: "room_full" };
    }

    rooms.set(roomId, room);
    room.sockets.add(socket);
    seat(room, socket.data.clientId);
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
    unseat(room, socket.data.clientId);
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

  const roomOf = (socket: RealtimeSocket): Room | null => {
    const { roomId } = socket.data;
    return roomId === null ? null : (rooms.get(roomId) ?? null);
  };

  const capture = (
    socket: RealtimeSocket,
    input: MovementInput
  ): CaptureOutcome => {
    const room = roomOf(socket);
    if (room === null) {
      return "not_in_room";
    }
    if (room.kind !== "lobby") {
      return "wrong_room_kind";
    }
    room.inputs.capture(socket.data.clientId, input);
    return "captured";
  };

  const captureDuel = (
    socket: RealtimeSocket,
    intent: DuelIntent
  ): CaptureOutcome => {
    const room = roomOf(socket);
    if (room === null) {
      return "not_in_room";
    }
    if (room.kind !== "duel") {
      return "wrong_room_kind";
    }
    const { clientId } = socket.data;
    if (intent.move !== undefined) {
      room.inputs.move(clientId, intent.move);
    }
    if (intent.fire !== undefined) {
      room.inputs.fire(clientId, intent.fire);
    }
    if (intent.rematch === true) {
      room.inputs.rematch(clientId);
    }
    return "captured";
  };

  const advance = (ticks: number, deltaSeconds: number): AdvancedRoom[] =>
    [...rooms.values()].map((room) =>
      room.kind === "duel"
        ? advanceDuel(room, ticks, deltaSeconds)
        : advanceLobby(room, ticks, deltaSeconds)
    );

  return {
    advance,
    capture,
    captureDuel,
    count: () => rooms.size,
    disposeAll: async () => {
      const closing = [...rooms.values()].map(
        async (room) => await room.ledger?.close()
      );
      for (const room of rooms.values()) {
        rooms.delete(room.id);
        disposeWorld(room);
      }
      await Promise.all(closing);
    },
    get: (roomId) => rooms.get(roomId),
    join,
    leave,
  };
};
