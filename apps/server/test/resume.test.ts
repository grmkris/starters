import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  LOBBY_ROOM_ID,
  PROTOCOL_VERSION,
  ResumeToken,
  RoomId,
} from "@agent-native/domain";
import type { ClientId } from "@agent-native/domain";
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
): Promise<{ readonly client: TestClient; readonly clientId: ClientId }> => {
  const client = await harness.connect();
  await client.next("session.welcome");
  client.send({
    resume,
    roomId: LOBBY_ROOM_ID,
    seq: 1,
    type: "room.join",
    v: PROTOCOL_VERSION,
  });
  const joined = await client.next("room.joined");
  expect(joined.roomId).toBe(LOBBY_ROOM_ID);
  return { client, clientId: joined.clientId };
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
});
