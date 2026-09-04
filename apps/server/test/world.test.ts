import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { LOBBY_ROOM_ID, PROTOCOL_VERSION } from "@agent-native/domain";
import type { ClientId } from "@agent-native/domain";

import { startHarness } from "./harness";
import type { Harness, TestClient } from "./harness";

/**
 * Two clients against one server. This is the property the README calls
 * "server-authoritative realtime", and nothing proved it: the only multi-client
 * behaviour under test was presence counting, which a server could satisfy
 * without ever sharing a world.
 *
 * These describe one shared world because that is what exists today. When rooms
 * land they become the isolation test, by pointing the clients at different
 * rooms and inverting the expectations.
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
    const first = await harness.connect();
    const firstWelcome = await first.next("session.welcome");
    const second = await harness.connect();
    const secondWelcome = await second.next("session.welcome");

    const shared = await first.until("world.snapshot", (message) => {
      const ids = idsIn(message.players);
      return (
        has(ids, firstWelcome.clientId) && has(ids, secondWelcome.clientId)
      );
    });

    expect(idsIn(shared.players)).toContain(firstWelcome.clientId);
    expect(idsIn(shared.players)).toContain(secondWelcome.clientId);

    await second.close();
    await first.close();
  });

  test("moves only the client that sent input", async () => {
    const first = await harness.connect();
    const firstWelcome = await first.next("session.welcome");
    const firstId = firstWelcome.clientId;
    const second = await harness.connect();
    const secondWelcome = await second.next("session.welcome");
    const secondId = secondWelcome.clientId;

    const secondStart = await positionOf(first, secondId);
    const firstStart = await positionOf(first, firstId);

    first.send({
      input: { x: 1, z: 0 },
      roomId: LOBBY_ROOM_ID,
      seq: 1,
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

    await second.close();
    await first.close();
  });

  test("drops a client from the world when it disconnects", async () => {
    const first = await harness.connect();
    await first.next("session.welcome");
    const second = await harness.connect();
    const welcome = await second.next("session.welcome");
    const secondId = welcome.clientId;

    await positionOf(first, secondId);
    await second.close();

    const without = await first.until(
      "world.snapshot",
      (message) => !has(idsIn(message.players), secondId)
    );

    expect(idsIn(without.players)).not.toContain(secondId);

    await first.close();
  });
});
