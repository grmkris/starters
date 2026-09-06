import { describe, expect, test } from "bun:test";

import {
  ClientId,
  LOBBY_ROOM_ID,
  makeResumeToken,
  PROTOCOL_VERSION,
  RoomCode,
  RoomId,
} from "@agent-native/domain";
import type { DuelEvent } from "@agent-native/game-three";
import { decodeClientMessage } from "@agent-native/protocol";
import type { ResumeClaim, ServerMessage } from "@agent-native/protocol";
import { Result, Schema } from "effect";

import { RealtimeStore } from "../src/lib/realtime-store";
import type {
  IdentityStorage,
  OutboundSocket,
} from "../src/lib/realtime-store";

/**
 * What the store puts on a socket when it attaches, which is the whole of the
 * client's side of resume: a claim is presented on `room.join` or it is not.
 */

const memoryStorage = () => {
  const entries = new Map<string, string>();
  const storage: IdentityStorage = {
    getItem: (key) => entries.get(key) ?? null,
    removeItem: (key) => {
      entries.delete(key);
    },
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
  return { entries, storage };
};

const asCode = Schema.decodeUnknownSync(RoomCode);

/** A store that, like the runtime page, wants the lobby. */
const lobbyStore = (storage: IdentityStorage | null): RealtimeStore => {
  const store = new RealtimeStore(storage);
  store.joinRoom(LOBBY_ROOM_ID);
  return store;
};

const openSocket = () => {
  const sent: string[] = [];
  const socket: OutboundSocket = {
    readyState: WebSocket.OPEN,
    send: (data) => {
      sent.push(data);
    },
  };
  return { sent, socket };
};

/** The claim carried by the first join frame, or null when it carried none. */
const claimOn = (frame: string | undefined): ResumeClaim | null => {
  if (frame === undefined) {
    throw new Error("No frame was sent");
  }
  const decoded = decodeClientMessage(frame);
  if (Result.isFailure(decoded) || decoded.success.type !== "room.join") {
    throw new Error(`Expected a room.join frame, got ${frame}`);
  }
  return decoded.success.resume ?? null;
};

/** Plays the server's side of a successful join back into the store. */
const welcomeAndJoin = (
  store: RealtimeStore,
  welcomed: ClientId,
  joinedAs: ClientId
) => {
  const resumeToken = makeResumeToken();
  store.apply({
    clientId: welcomed,
    resumeToken,
    seq: 1,
    tickRate: 20,
    type: "session.welcome",
    v: PROTOCOL_VERSION,
  });
  store.apply({
    capacity: 16,
    clientId: joinedAs,
    connected: 1,
    roomId: LOBBY_ROOM_ID,
    seq: 2,
    type: "room.joined",
    v: PROTOCOL_VERSION,
  });
  return resumeToken;
};

describe("realtime store identity", () => {
  test("joins without a claim when it has never been joined", () => {
    const store = lobbyStore(memoryStorage().storage);
    const { sent, socket } = openSocket();

    store.attach(socket);

    expect(claimOn(sent[0])).toBeNull();
  });

  test("presents the identity it was joined with on the next connection", () => {
    const { entries, storage } = memoryStorage();
    const store = lobbyStore(storage);
    const clientId = ClientId.generate();
    store.attach(openSocket().socket);

    const resumeToken = welcomeAndJoin(store, clientId, clientId);
    const { sent, socket } = openSocket();
    store.attach(socket);

    expect(claimOn(sent[0])).toEqual({ clientId, resumeToken });
    expect(entries.size).toBe(1);
  });

  test("keeps the identity the world chose, with the token it was welcomed with", () => {
    const store = lobbyStore(memoryStorage().storage);
    const welcomed = ClientId.generate();
    const reclaimed = ClientId.generate();
    store.attach(openSocket().socket);

    // The server honoured a claim: the world knows this connection by the
    // older id, but the secret for next time is this connection's own.
    const resumeToken = welcomeAndJoin(store, welcomed, reclaimed);
    const { sent, socket } = openSocket();
    store.attach(socket);

    expect(claimOn(sent[0])).toEqual({ clientId: reclaimed, resumeToken });
    expect(store.getMetaSnapshot().clientId).toBe(reclaimed);
  });

  test("restores an identity a previous page stored", () => {
    const { storage } = memoryStorage();
    const clientId = ClientId.generate();
    const resumeToken = welcomeAndJoin(lobbyStore(storage), clientId, clientId);

    const reloaded = lobbyStore(storage);
    const { sent, socket } = openSocket();
    reloaded.attach(socket);

    expect(claimOn(sent[0])).toEqual({ clientId, resumeToken });
  });

  test("ignores a stored identity it cannot decode", () => {
    const { entries, storage } = memoryStorage();
    entries.set("field01.identity", '{"clientId":"nobody"}');
    const store = lobbyStore(storage);
    const { sent, socket } = openSocket();

    store.attach(socket);

    expect(claimOn(sent[0])).toBeNull();
  });

  test("drops the identity once told another connection holds it", () => {
    const { entries, storage } = memoryStorage();
    const store = lobbyStore(storage);
    const clientId = ClientId.generate();
    store.attach(openSocket().socket);
    welcomeAndJoin(store, clientId, clientId);

    store.forgetIdentity();
    const { sent, socket } = openSocket();
    store.attach(socket);

    expect(claimOn(sent[0])).toBeNull();
    expect(entries.size).toBe(0);
  });

  test("asks for the bot once the socket opens, not before", () => {
    const store = new RealtimeStore(memoryStorage().storage);
    store.botDuel();
    const { sent, socket } = openSocket();

    store.attach(socket);

    const first = decodeClientMessage(sent[0] ?? "");
    expect(Result.isSuccess(first) ? first.success.type : null).toBe(
      "duel.bot"
    );
  });

  test("joins the room a match names and stops waiting", () => {
    const store = new RealtimeStore(memoryStorage().storage);
    const { sent, socket } = openSocket();
    store.attach(socket);
    store.queueDuel();
    expect(store.getDuelSnapshot().waiting).toBe(0);
    store.apply({
      seconds: 7,
      seq: 1,
      type: "duel.waiting",
      v: PROTOCOL_VERSION,
    });
    expect(store.getDuelSnapshot().waiting).toBe(7);

    const roomId = RoomId.generate();
    store.apply({
      code: asCode("ABCD"),
      roomId,
      seq: 2,
      type: "duel.matched",
      v: PROTOCOL_VERSION,
    });

    expect(store.getDuelSnapshot().waiting).toBeNull();
    const last = decodeClientMessage(sent.at(-1) ?? "");
    expect(
      Result.isSuccess(last) && last.success.type === "room.join"
        ? last.success.roomId
        : null
    ).toBe(roomId);
  });

  test("works without any storage at all", () => {
    const store = lobbyStore(null);
    const clientId = ClientId.generate();
    store.attach(openSocket().socket);

    const resumeToken = welcomeAndJoin(store, clientId, clientId);
    const { sent, socket } = openSocket();
    store.attach(socket);

    // Held in memory for a reconnect within the page; only the reload is lost.
    expect(claimOn(sent[0])).toEqual({ clientId, resumeToken });
  });
});

type DuelSnapshotMessage = Extract<
  ServerMessage,
  { readonly type: "duel.snapshot" }
>;

const roomId = RoomId.generate();
const left = ClientId.generate();
const right = ClientId.generate();

const duelist = (
  clientId: ClientId,
  side: -1 | 1,
  health: number
): DuelSnapshotMessage["players"][number] => ({
  clientId,
  cooldown: 0,
  health,
  position: { x: side * 3, y: 0.5, z: 0 },
  rematch: false,
  rounds: 0,
  side,
});

const shot = (
  id: number,
  ownerId: ClientId,
  x: number,
  vz: number
): DuelSnapshotMessage["projectiles"][number] => ({
  id,
  ownerId,
  position: { x, y: 0.5, z: 0 },
  velocity: { x: 6.67, z: vz },
});

const snapshot = (
  tick: number,
  overrides: Partial<Omit<DuelSnapshotMessage, "type" | "v" | "seq" | "tick">>
): DuelSnapshotMessage => ({
  countdown: 0,
  phase: "playing",
  players: [duelist(left, -1, 3), duelist(right, 1, 3)],
  projectiles: [],
  roomId,
  round: 1,
  seq: tick,
  tick,
  type: "duel.snapshot",
  v: PROTOCOL_VERSION,
  winner: null,
  ...overrides,
});

/** Applies `first` then `second` and returns what happened between them. */
const between = (
  first: DuelSnapshotMessage,
  second: DuelSnapshotMessage
): DuelEvent[] => {
  const store = new RealtimeStore(memoryStorage().storage);
  const events: DuelEvent[] = [];
  store.apply(first);
  store.subscribeEvents((event) => {
    events.push(event);
  });
  store.apply(second);
  return events;
};

describe("duel events", () => {
  test("a shot that was not there is a fire", () => {
    const events = between(
      snapshot(1, {}),
      snapshot(2, { projectiles: [shot(1, left, -2.5, 0)] })
    );

    expect(events).toEqual([
      { at: { x: -2.5, z: 0 }, id: 1, kind: "fire", ownerId: left },
    ]);
  });

  test("a shot whose lane velocity flipped has banked", () => {
    const events = between(
      snapshot(1, { projectiles: [shot(1, left, -1, 4)] }),
      snapshot(2, { projectiles: [shot(1, left, -0.5, -4)] })
    );

    expect(events.map((event) => event.kind)).toEqual(["bounce"]);
  });

  test("a shot whose x changed sign has crossed the seam", () => {
    const events = between(
      snapshot(1, { projectiles: [shot(1, left, -0.2, 0)] }),
      snapshot(2, { projectiles: [shot(1, left, 0.15, 0)] })
    );

    expect(events).toEqual([
      { at: { x: 0.15, z: 0 }, id: 1, kind: "cross", ownerId: left },
    ]);
  });

  test("a player whose health fell was hit by the other", () => {
    const events = between(
      snapshot(1, {}),
      snapshot(2, { players: [duelist(left, -1, 3), duelist(right, 1, 2)] })
    );

    expect(events).toEqual([
      { at: { x: 3, z: 0 }, by: left, clientId: right, kind: "hit" },
    ]);
  });

  test("entering roundOver and matchOver are announced once each", () => {
    const over = snapshot(2, { phase: "roundOver", winner: -1 });
    const first = between(snapshot(1, {}), over);
    const again = between(
      over,
      snapshot(3, { phase: "roundOver", winner: -1 })
    );
    const match = between(
      over,
      snapshot(4, { phase: "matchOver", winner: -1 })
    );

    expect(first).toEqual([{ kind: "round", winner: -1 }]);
    expect(again).toEqual([]);
    expect(match).toEqual([{ kind: "match", winner: -1 }]);
  });

  test("a straight shot never banks and a resting player is never hit", () => {
    const events = between(
      snapshot(1, { projectiles: [shot(1, left, -2, 0)] }),
      snapshot(2, { projectiles: [shot(1, left, -1.6, 0)] })
    );

    expect(events).toEqual([]);
  });
});
