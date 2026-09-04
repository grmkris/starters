import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { LOBBY_ROOM_ID, PROTOCOL_VERSION, RoomId } from "@agent-native/domain";
import type { ClientId } from "@agent-native/domain";

import { startHarness } from "./harness";
import type { Harness, TestClient } from "./harness";

/**
 * Two clients against one server. This is the property the README calls
 * "server-authoritative realtime", and nothing proved it: the only multi-client
 * behaviour under test was presence counting, which a server could satisfy
 * without ever sharing a world.
 *
 * Two clients in one room share a world; two clients in different rooms share
 * nothing. The second half is the property that makes "server-authoritative
 * rooms" a gate rather than a claim, and before rooms it was false: one global
 * simulation broadcast every snapshot to every socket regardless of roomId.
 */

const has = (ids: readonly ClientId[], id: ClientId): boolean =>
  ids.includes(id);

const idsIn = (players: readonly { readonly clientId: ClientId }[]) =>
  players.map((player) => player.clientId);

const positionOf = async (
  client: TestClient,
  clientId: ClientId
): Promise<{ readonly x: number; readonly z: number }> => {
  const snapshot = await client.until("world.snapshot", (message) =>
    has(idsIn(message.players), clientId)
  );
  const player = snapshot.players.find(
    (candidate) => candidate.clientId === clientId
  );
  if (player === undefined) {
    throw new Error(`${clientId} vanished between match and read`);
  }
  return { x: player.position.x, z: player.position.z };
};

let harness: Harness;

beforeEach(() => {
  harness = startHarness();
});

afterEach(async () => {
  await harness.close();
});

describe("shared world", () => {
  test("puts both clients in each other's snapshots", async () => {
    const first = await harness.join(LOBBY_ROOM_ID);
    const second = await harness.join(LOBBY_ROOM_ID);

    const shared = await first.client.until("world.snapshot", (message) => {
      const ids = idsIn(message.players);
      return has(ids, first.clientId) && has(ids, second.clientId);
    });

    expect(idsIn(shared.players)).toContain(first.clientId);
    expect(idsIn(shared.players)).toContain(second.clientId);

    await second.client.close();
    await first.client.close();
  });

  test("moves only the client that sent input", async () => {
    const alpha = await harness.join(LOBBY_ROOM_ID);
    const beta = await harness.join(LOBBY_ROOM_ID);
    const first = alpha.client;
    const firstId = alpha.clientId;
    const secondId = beta.clientId;

    const secondStart = await positionOf(first, secondId);
    const firstStart = await positionOf(first, firstId);

    first.send({
      input: { x: 1, z: 0 },
      seq: 2,
      type: "player.input",
      v: PROTOCOL_VERSION,
    });

    const moved = await first.until("world.snapshot", (message) => {
      const player = message.players.find(
        (candidate) => candidate.clientId === firstId
      );
      return player !== undefined && player.position.x > firstStart.x;
    });

    const other = moved.players.find(
      (candidate) => candidate.clientId === secondId
    );
    // The mover moved; the client that sent nothing did not.
    expect(other?.position.x).toBe(secondStart.x);
    expect(other?.position.z).toBe(secondStart.z);

    await beta.client.close();
    await first.close();
  });

  test("drops a client from the world when it disconnects", async () => {
    const alpha = await harness.join(LOBBY_ROOM_ID);
    const beta = await harness.join(LOBBY_ROOM_ID);
    const first = alpha.client;
    const secondId = beta.clientId;

    await positionOf(first, secondId);
    await beta.client.close();

    const without = await first.until(
      "world.snapshot",
      (message) => !has(idsIn(message.players), secondId)
    );

    expect(idsIn(without.players)).not.toContain(secondId);

    await first.close();
  });

  test("keeps two rooms out of each other's worlds", async () => {
    const alphaRoom = RoomId.generate();
    const betaRoom = RoomId.generate();
    const alpha = await harness.join(alphaRoom);
    const beta = await harness.join(betaRoom);

    // Let both rooms tick several times over.
    await alpha.client.until("world.snapshot", (message) => message.tick > 3);
    await beta.client.until("world.snapshot", (message) => message.tick > 3);

    const alphaSaw = alpha.client.received;
    const roomsAlphaSaw = new Set(
      alphaSaw.flatMap((message) =>
        "roomId" in message ? [message.roomId] : []
      )
    );

    // Nothing about the other room reaches this client - not a snapshot, not a
    // presence count. Before rooms, every socket received every broadcast.
    expect([...roomsAlphaSaw]).toEqual([alphaRoom]);
    for (const message of alphaSaw) {
      if (message.type === "world.snapshot") {
        expect(idsIn(message.players)).not.toContain(beta.clientId);
        expect(idsIn(message.players)).toEqual([alpha.clientId]);
      }
      if (message.type === "room.presence") {
        expect(message.connected).toBe(1);
      }
    }

    await beta.client.close();
    await alpha.client.close();
  });

  test("does not tell one room that another lost a client", async () => {
    const alphaRoom = RoomId.generate();
    const alpha = await harness.join(alphaRoom);
    const beta = await harness.join(RoomId.generate());

    await alpha.client.until("world.snapshot", (message) => message.tick > 2);
    const before = alpha.client.received.length;

    await beta.client.close();
    // Give the departure every chance to be broadcast to the wrong room.
    await alpha.client.until("world.snapshot", (message) => message.tick > 8);

    const presenceAfter = alpha.client.received
      .slice(before)
      .filter((message) => message.type === "room.presence");

    expect(presenceAfter).toEqual([]);

    await alpha.client.close();
  });
});
