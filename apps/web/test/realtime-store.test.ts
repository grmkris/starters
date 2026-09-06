import { describe, expect, test } from "bun:test";

import {
  ClientId,
  LOBBY_ROOM_ID,
  makeResumeToken,
  PROTOCOL_VERSION,
  RoomCode,
  RoomId,
} from "@agent-native/domain";
import { decodeClientMessage } from "@agent-native/protocol";
import type { ResumeClaim } from "@agent-native/protocol";
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
