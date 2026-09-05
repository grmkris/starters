import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  LOBBY_ROOM_ID,
  PROTOCOL_VERSION,
  RoomCode,
} from "@agent-native/domain";
import { Schema } from "effect";

import { parseLedger, replayLedger } from "../src/replay";
import { startHarness } from "./harness";
import type { Harness } from "./harness";

/**
 * The duel over real sockets: codes resolve, the second player starts the
 * countdown, a shot from one side shows up on the other, and a recorded match
 * replays exactly. The rules themselves are tested in game-core; this is the
 * room around them.
 */

const decodeCode = Schema.decodeUnknownSync(RoomCode);

let harness: Harness;

beforeEach(() => {
  harness = startHarness();
});

afterEach(async () => {
  await harness.close();
});

describe("duel rooms", () => {
  test("creates a room with a code and seats the creator on the left", async () => {
    const host = await harness.createDuel();

    const snapshot = await host.client.next("duel.snapshot");
    expect(snapshot.phase).toBe("waiting");
    expect(snapshot.players.map((player) => player.side)).toEqual([-1]);
    expect(snapshot.players[0]?.clientId).toBe(host.clientId);

    await host.client.close();
  });

  test("finds the room by its code and counts down once two are seated", async () => {
    const host = await harness.createDuel();
    const guest = await harness.joinDuel(host.code);

    expect(guest.roomId).toBe(host.roomId);
    const counting = await guest.client.until(
      "duel.snapshot",
      (message) => message.phase === "countdown"
    );
    expect(counting.players.map((player) => player.side)).toEqual([-1, 1]);

    await guest.client.close();
    await host.client.close();
  });

  test("tells a client when a code names nothing", async () => {
    const client = await harness.connect();
    await client.next("session.welcome");

    client.say({
      code: decodeCode("ZZZZ"),
      type: "duel.join",
      v: PROTOCOL_VERSION,
    });
    const missing = await client.next("duel.notFound");

    expect(missing.code).toBe(decodeCode("ZZZZ"));
    await client.close();
  });

  test("refuses a third player", async () => {
    const host = await harness.createDuel();
    const guest = await harness.joinDuel(host.code);

    const third = await harness.connect();
    await third.next("session.welcome");
    third.say({ roomId: host.roomId, type: "room.join", v: PROTOCOL_VERSION });
    const rejected = await third.next("room.rejected");

    expect(rejected.reason).toBe("room_full");
    await third.close();
    await guest.client.close();
    await host.client.close();
  });

  test("a shot fired on one side arrives on the other", async () => {
    const host = await harness.createDuel();
    const guest = await harness.joinDuel(host.code);
    await guest.client.until(
      "duel.snapshot",
      (message) => message.phase === "playing"
    );

    host.client.say({
      fire: { angle: 0 },
      type: "duel.fire",
      v: PROTOCOL_VERSION,
    });

    // The guest's own feed shows the host's shot past the seam.
    const crossed = await guest.client.until("duel.snapshot", (message) =>
      message.projectiles.some(
        (projectile) =>
          projectile.ownerId === host.clientId && projectile.position.x > 0
      )
    );
    expect(crossed.phase).toBe("playing");

    await guest.client.close();
    await host.client.close();
  });

  test("moves only the player that asked", async () => {
    const host = await harness.createDuel();
    const guest = await harness.joinDuel(host.code);
    await host.client.until(
      "duel.snapshot",
      (message) => message.phase === "playing"
    );

    host.client.say({
      move: { target: 3 },
      type: "duel.move",
      v: PROTOCOL_VERSION,
    });

    const moved = await host.client.until("duel.snapshot", (message) => {
      const me = message.players.find(
        (player) => player.clientId === host.clientId
      );
      return me !== undefined && me.position.z > 1;
    });
    const other = moved.players.find(
      (player) => player.clientId === guest.clientId
    );
    expect(other?.position.z).toBe(0);

    await guest.client.close();
    await host.client.close();
  });

  test("refuses intent meant for the other kind of room", async () => {
    const host = await harness.createDuel();
    host.client.say({
      input: { x: 1, z: 0 },
      type: "player.input",
      v: PROTOCOL_VERSION,
    });
    const wrongForDuel = await host.client.next("protocol.error");
    expect(wrongForDuel.code).toBe("wrong_room_kind");

    const roamer = await harness.join(LOBBY_ROOM_ID);
    roamer.client.say({
      fire: { angle: 0 },
      type: "duel.fire",
      v: PROTOCOL_VERSION,
    });
    const wrongForLobby = await roamer.client.next("protocol.error");
    expect(wrongForLobby.code).toBe("wrong_room_kind");

    await roamer.client.close();
    await host.client.close();
  });

  test("voids the match when a player leaves", async () => {
    const host = await harness.createDuel();
    const guest = await harness.joinDuel(host.code);
    await host.client.until(
      "duel.snapshot",
      (message) => message.phase === "countdown"
    );

    await guest.client.close();

    const alone = await host.client.until(
      "duel.snapshot",
      (message) => message.phase === "waiting"
    );
    expect(alone.players).toHaveLength(1);

    await host.client.close();
  });
});

describe("duel ledger", () => {
  test("replays a recorded duel exactly", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "field01-duel-"));
    const recording = startHarness({ ledgerDirectory: directory });
    try {
      const host = await recording.createDuel();
      const guest = await recording.joinDuel(host.code);
      await host.client.until(
        "duel.snapshot",
        (message) => message.phase === "playing"
      );
      host.client.say({
        move: { target: 2 },
        type: "duel.move",
        v: PROTOCOL_VERSION,
      });
      host.client.say({
        fire: { angle: 0.4 },
        type: "duel.fire",
        v: PROTOCOL_VERSION,
      });
      guest.client.say({
        fire: { angle: -0.2 },
        type: "duel.fire",
        v: PROTOCOL_VERSION,
      });
      await host.client.until(
        "duel.snapshot",
        (message) => message.projectiles.length === 0 && message.tick > 80
      );
      await guest.client.close();
      await host.client.close();
      await recording.close();

      const file = readdirSync(directory).find((name) =>
        name.startsWith(host.roomId)
      );
      if (file === undefined) {
        throw new Error("No ledger was written for the duel");
      }
      const source = await Bun.file(path.join(directory, file)).text();
      const { failures, records } = parseLedger(source);
      const report = replayLedger(records);

      expect(failures).toEqual([]);
      expect(report.ticks).toBeGreaterThan(80);
      expect(report.divergence).toBeNull();
    } finally {
      await recording.close();
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
