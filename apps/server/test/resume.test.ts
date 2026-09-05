import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  LOBBY_ROOM_ID,
  PROTOCOL_VERSION,
  ResumeToken,
  RoomId,
} from "@agent-native/domain";
import type { ClientId } from "@agent-native/domain";
import { SUPERSEDED_CLOSE_CODE } from "@agent-native/protocol";
import { Schema } from "effect";

import { startHarness } from "./harness";
import type { Harness, TestClient } from "./harness";

/**
 * A reconnect used to mint a new identity every time, so a dropped client came
 * back as a stranger. Resume returns the identity and nothing else: the entity
 * respawns, which is what keeps empty-room collection immediate and avoids
 * inventing a policy for how long a vacated world persists.
 *
 * The token is the whole claim, so these check that the claim is actually
 * checked - a ClientId alone must not be enough, or the "identity" would be
 * whatever anyone typed.
 */

/** Well-formed, so it reaches the identity check rather than failing to decode. */
const unissuedToken = Schema.decodeUnknownSync(ResumeToken)("0".repeat(32));

const rejoin = async (
  harness: Harness,
  resume: { readonly clientId: ClientId; readonly resumeToken: ResumeToken }
): Promise<{
  readonly client: TestClient;
  readonly clientId: ClientId;
  /** The token this connection was welcomed with, valid for the next resume. */
  readonly resumeToken: ResumeToken;
}> => {
  const client = await harness.connect();
  const welcome = await client.next("session.welcome");
  client.send({
    resume,
    roomId: LOBBY_ROOM_ID,
    seq: 1,
    type: "room.join",
    v: PROTOCOL_VERSION,
  });
  const joined = await client.next("room.joined");
  expect(joined.roomId).toBe(LOBBY_ROOM_ID);
  return {
    client,
    clientId: joined.clientId,
    resumeToken: welcome.resumeToken,
  };
};

let harness: Harness;

beforeEach(() => {
  harness = startHarness();
});

afterEach(async () => {
  await harness.close();
});

describe("resume", () => {
  test("returns the identity when the pair matches", async () => {
    const first = await harness.join(LOBBY_ROOM_ID);
    const original = first.clientId;
    await first.client.close();

    const second = await rejoin(harness, {
      clientId: original,
      resumeToken: first.resumeToken,
    });

    expect(second.clientId).toBe(original);
    await second.client.close();
  });

  test("mints a new identity when the token is wrong", async () => {
    const first = await harness.join(LOBBY_ROOM_ID);
    const other = await harness.join(RoomId.generate());
    const original = first.clientId;
    await first.client.close();

    // Somebody else's token, which is the attack this exists to refuse.
    const second = await rejoin(harness, {
      clientId: original,
      resumeToken: other.resumeToken,
    });

    expect(second.clientId).not.toBe(original);
    await other.client.close();
    await second.client.close();
  });

  test("mints a new identity for an id it never issued", async () => {
    const stranger = await harness.join(LOBBY_ROOM_ID);
    await stranger.client.close();

    const second = await rejoin(harness, {
      clientId: stranger.clientId,
      resumeToken: unissuedToken,
    });

    expect(second.clientId).not.toBe(stranger.clientId);
    await second.client.close();
  });

  test("spends a token, so it cannot be replayed", async () => {
    const first = await harness.join(LOBBY_ROOM_ID);
    const original = first.clientId;
    const { resumeToken } = first;
    await first.client.close();

    const second = await rejoin(harness, { clientId: original, resumeToken });
    expect(second.clientId).toBe(original);
    await second.client.close();

    // The same pair a second time is no longer a valid claim.
    const third = await rejoin(harness, { clientId: original, resumeToken });
    expect(third.clientId).not.toBe(original);
    await third.client.close();
  });

  test("gives a fresh identity when no resume is offered", async () => {
    const first = await harness.join(LOBBY_ROOM_ID);
    const original = first.clientId;
    await first.client.close();

    const second = await harness.join(LOBBY_ROOM_ID);

    expect(second.clientId).not.toBe(original);
    await second.client.close();
  });

  test("keeps the right token valid after a wrong one is tried", async () => {
    const first = await harness.join(LOBBY_ROOM_ID);
    const original = first.clientId;
    await first.client.close();

    // Ids are public - every snapshot lists them - so this is what any room
    // member could send. It must not cost the real holder their claim.
    const impostor = await rejoin(harness, {
      clientId: original,
      resumeToken: unissuedToken,
    });
    expect(impostor.clientId).not.toBe(original);
    await impostor.client.close();

    const owner = await rejoin(harness, {
      clientId: original,
      resumeToken: first.resumeToken,
    });
    expect(owner.clientId).toBe(original);
    await owner.client.close();
  });

  test("lets a resumed client resume again with the token it was handed", async () => {
    const first = await harness.join(LOBBY_ROOM_ID);
    const original = first.clientId;
    await first.client.close();

    const second = await rejoin(harness, {
      clientId: original,
      resumeToken: first.resumeToken,
    });
    expect(second.clientId).toBe(original);
    await second.client.close();

    // The claim rolls over to the token the second connection was welcomed
    // with, so a client that keeps its latest welcome can always come back.
    const third = await rejoin(harness, {
      clientId: original,
      resumeToken: second.resumeToken,
    });
    expect(third.clientId).toBe(original);
    await third.client.close();
  });

  test("moves the identity off a socket the server still believes is open", async () => {
    const first = await harness.join(LOBBY_ROOM_ID);
    const original = first.clientId;
    // Deliberately not closed: from the server's side the first connection is
    // still live, as it is after a drop the client noticed before the server.

    const second = await rejoin(harness, {
      clientId: original,
      resumeToken: first.resumeToken,
    });
    expect(second.clientId).toBe(original);

    // The stale connection is told why it went, and the room counts one.
    expect(await first.client.closed).toBe(SUPERSEDED_CLOSE_CODE);
    const presence = await second.client.next("room.presence");
    expect(presence.connected).toBe(1);

    // One entity, and it outlives the stale socket's close being processed.
    const early = await second.client.next("world.snapshot");
    const later = await second.client.until(
      "world.snapshot",
      (message) => message.tick >= early.tick + 10
    );
    expect(
      later.players.filter((player) => player.clientId === original)
    ).toHaveLength(1);

    await second.client.close();
  });
});

describe("resume window", () => {
  test("counts from the disconnect, not from the connect", async () => {
    const short = startHarness({ resumeTtlMs: 500 });
    try {
      const first = await short.join(LOBBY_ROOM_ID);
      // Stay connected for longer than the whole window.
      await first.client.until(
        "world.snapshot",
        (message) => message.tick > 12
      );
      await first.client.close();

      const second = await rejoin(short, {
        clientId: first.clientId,
        resumeToken: first.resumeToken,
      });
      expect(second.clientId).toBe(first.clientId);
      await second.client.close();
    } finally {
      await short.close();
    }
  });

  test("refuses a claim once the window has passed", async () => {
    const instant = startHarness({ resumeTtlMs: 0 });
    try {
      const first = await instant.join(LOBBY_ROOM_ID);
      await first.client.close();

      const second = await rejoin(instant, {
        clientId: first.clientId,
        resumeToken: first.resumeToken,
      });
      expect(second.clientId).not.toBe(first.clientId);
      await second.client.close();
    } finally {
      await instant.close();
    }
  });
});
