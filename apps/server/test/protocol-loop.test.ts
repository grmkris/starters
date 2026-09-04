import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { LOBBY_ROOM_ID, PROTOCOL_VERSION, RoomId } from "@agent-native/domain";

import { sendRaw, startHarness } from "./harness";
import type { Harness } from "./harness";

/**
 * Covers the websocket loop in apps/server/src/index.ts, which had no test of
 * any kind: everything under apps/server/test was a pure unit over an extracted
 * module, and the only thing touching a live server was a browser smoke test.
 *
 * These pin CURRENT behaviour deliberately, before rooms change it, so that the
 * protocol change shows up as a diff in named expectations rather than as a
 * fresh set of tests written against the new shape.
 */

let harness: Harness;

beforeEach(() => {
  harness = startHarness();
});

afterEach(async () => {
  await harness.close();
});

describe("realtime protocol loop", () => {
  test("welcomes a connection with an identity and the tick rate", async () => {
    const client = await harness.connect();
    const welcome = await client.next("session.welcome");

    expect(welcome.v).toBe(PROTOCOL_VERSION);
    expect(welcome.tickRate).toBeGreaterThan(0);
    expect(welcome.clientId).toMatch(/^cli_/u);
    // Identity only. The connection is somewhere once it asks to be, not
    // because the upgrade seeded a room it never chose.
    expect(welcome.resumeToken).toMatch(/^[0-9a-f]{32}$/u);

    await client.close();
  });

  test("answers a ping with the timestamp it was given", async () => {
    const client = await harness.connect();
    await client.next("session.welcome");

    const sentAt = 1_234_567;
    client.send({ sentAt, seq: 1, type: "ping", v: PROTOCOL_VERSION });
    const pong = await client.next("pong");

    expect(pong.sentAt).toBe(sentAt);

    await client.close();
  });

  test("reports an undecodable frame instead of ignoring it", async () => {
    const client = await harness.connect();
    await client.next("session.welcome");

    await sendRaw(harness.url, "{ this is not a protocol message");
    // The bad frame arrives on its own socket, so this client stays healthy.
    client.send({ sentAt: 1, seq: 1, type: "ping", v: PROTOCOL_VERSION });

    const pong = await client.next("pong");
    expect(pong.sentAt).toBe(1);

    await client.close();
  });

  test("answers the sender of an undecodable frame with protocol.error", async () => {
    const client = await harness.connect();
    await client.next("session.welcome");

    client.send({ sentAt: 1, seq: 1, type: "ping", v: PROTOCOL_VERSION });
    await client.next("pong");

    // oxlint-disable-next-line promise/avoid-new -- bridging an EventTarget
    const failure = await new Promise<string>((resolve) => {
      const socket = new WebSocket(harness.url);
      socket.addEventListener("open", () => {
        socket.send("not json at all");
      });
      socket.addEventListener("message", (event) => {
        const text = String(event.data);
        if (text.includes("protocol.error")) {
          socket.close();
          resolve(text);
        }
      });
    });

    expect(failure).toContain("invalid_message");
  });

  test("announces presence to everyone already in the room", async () => {
    const { client: first } = await harness.join(LOBBY_ROOM_ID);
    await first.next("room.presence");

    const { client: second } = await harness.join(LOBBY_ROOM_ID);

    // The join is observed by the client that was already there.
    const presence = await first.next("room.presence");
    expect(presence.connected).toBe(2);

    await second.close();
    await first.close();
  });

  test("announces presence again when a client leaves", async () => {
    const { client: first } = await harness.join(LOBBY_ROOM_ID);
    const { client: second } = await harness.join(LOBBY_ROOM_ID);

    // Three broadcasts reach `first`: its own join, the second join, the leave.
    const alone = await first.next("room.presence");
    const joined = await first.next("room.presence");
    expect(alone.connected).toBe(1);
    expect(joined.connected).toBe(2);

    await second.close();

    const left = await first.next("room.presence");
    expect(left.connected).toBe(1);

    await first.close();
  });

  test("numbers every message it sends", async () => {
    const client = await harness.connect();
    await client.next("session.welcome");
    client.send({ sentAt: 1, seq: 1, type: "ping", v: PROTOCOL_VERSION });
    await client.next("pong");

    const sequences = client.received.map((message) => message.seq);

    expect(sequences.length).toBeGreaterThan(1);
    expect(sequences).toEqual([...sequences].toSorted((a, b) => a - b));
    expect(new Set(sequences).size).toBe(sequences.length);

    await client.close();
  });

  test("advances the simulation and broadcasts a world", async () => {
    const { client, clientId } = await harness.join(LOBBY_ROOM_ID);
    const snapshot = await client.next("world.snapshot");

    expect(snapshot.tick).toBeGreaterThan(0);
    expect(snapshot.roomId).toBe(LOBBY_ROOM_ID);
    expect(snapshot.players.map((player) => player.clientId)).toContain(
      clientId
    );

    await client.close();
  });

  test("sends no world to a connection that has not joined", async () => {
    const client = await harness.connect();
    await client.next("session.welcome");

    // A roomless socket belongs to no room's set, so nothing is broadcast to
    // it. That is what makes "connected, no room" an honest state to render.
    client.send({
      input: { x: 1, z: 0 },
      seq: 1,
      type: "player.input",
      v: PROTOCOL_VERSION,
    });
    const failure = await client.next("protocol.error");

    expect(failure.code).toBe("not_in_room");
    expect(
      client.received.some((message) => message.type === "world.snapshot")
    ).toBe(false);

    await client.close();
  });

  test("refuses a second join rather than moving the socket silently", async () => {
    const { client } = await harness.join(LOBBY_ROOM_ID);

    client.send({
      roomId: RoomId.generate(),
      seq: 2,
      type: "room.join",
      v: PROTOCOL_VERSION,
    });
    const rejection = await client.next("room.rejected");

    expect(rejection.reason).toBe("already_in_room");

    // Rejection is about membership, not transport: the socket still works.
    client.send({ sentAt: 7, seq: 3, type: "ping", v: PROTOCOL_VERSION });
    const pong = await client.next("pong");
    expect(pong.sentAt).toBe(7);

    await client.close();
  });
});
