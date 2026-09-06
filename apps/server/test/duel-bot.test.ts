import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { PROTOCOL_VERSION } from "@agent-native/domain";
import { Schema } from "effect";

import { startHarness } from "./harness";
import type { Harness } from "./harness";

/**
 * The bot and the queue over real sockets. The bot is a client, so what is
 * checked is what any client would show: it joins, it moves, it fires, and it
 * goes when the human does.
 */

let harness: Harness;

beforeEach(() => {
  harness = startHarness();
});

afterEach(async () => {
  await harness.close();
});

const Health = Schema.Struct({ rooms: Schema.Int });
const decodeHealth = Schema.decodeUnknownSync(Health);

const roomsOpen = async (): Promise<number> => {
  const response = await fetch(`http://127.0.0.1:${harness.port}/health`);
  const body: unknown = await response.json();
  return decodeHealth(body).rooms;
};

describe("bot", () => {
  test("joins as the second player and starts the countdown", async () => {
    const client = await harness.connect();
    await client.next("session.welcome");
    client.say({ type: "duel.bot", v: PROTOCOL_VERSION });
    const created = await client.next("duel.created");
    client.say({
      roomId: created.roomId,
      type: "room.join",
      v: PROTOCOL_VERSION,
    });
    await client.next("room.joined");

    const counting = await client.until(
      "duel.snapshot",
      (message) => message.phase === "countdown"
    );
    expect(counting.players).toHaveLength(2);

    await client.close();
  });

  test("fires and follows once play begins", async () => {
    const client = await harness.connect();
    await client.next("session.welcome");
    client.say({ type: "duel.bot", v: PROTOCOL_VERSION });
    const created = await client.next("duel.created");
    client.say({
      roomId: created.roomId,
      type: "room.join",
      v: PROTOCOL_VERSION,
    });
    const joined = await client.next("room.joined");
    await client.until(
      "duel.snapshot",
      (message) => message.phase === "playing"
    );

    // A shot the human did not fire.
    const shot = await client.until("duel.snapshot", (message) =>
      message.projectiles.some(
        (projectile) => projectile.ownerId !== joined.clientId
      )
    );
    expect(shot.phase).toBe("playing");

    // Move away; the bot follows a few ticks later.
    client.say({ move: { target: 3 }, type: "duel.move", v: PROTOCOL_VERSION });
    const followed = await client.until("duel.snapshot", (message) => {
      const bot = message.players.find(
        (player) => player.clientId !== joined.clientId
      );
      return bot !== undefined && bot.position.z > 1.5;
    });
    expect(followed.phase).toBe("playing");

    await client.close();
  });

  test("is seated again when the human leaves and comes back", async () => {
    const client = await harness.connect();
    await client.next("session.welcome");
    client.say({ type: "duel.bot", v: PROTOCOL_VERSION });
    const created = await client.next("duel.created");
    client.say({
      roomId: created.roomId,
      type: "room.join",
      v: PROTOCOL_VERSION,
    });
    await client.next("room.joined");
    await client.until(
      "duel.snapshot",
      (message) => message.players.length === 2
    );

    // What a page remount does: leave, then join the same room again.
    client.say({ type: "room.leave", v: PROTOCOL_VERSION });
    await client.next("room.left");
    client.say({
      roomId: created.roomId,
      type: "room.join",
      v: PROTOCOL_VERSION,
    });
    await client.next("room.joined");

    const again = await client.until(
      "duel.snapshot",
      (message) => message.players.length === 2
    );
    expect(again.phase).toBe("countdown");

    await client.close();
  });

  test("goes when the human does, so the room is collected", async () => {
    const client = await harness.connect();
    await client.next("session.welcome");
    client.say({ type: "duel.bot", v: PROTOCOL_VERSION });
    const created = await client.next("duel.created");
    client.say({
      roomId: created.roomId,
      type: "room.join",
      v: PROTOCOL_VERSION,
    });
    await client.next("room.joined");
    await client.until(
      "duel.snapshot",
      (message) => message.players.length === 2
    );
    expect(await roomsOpen()).toBe(1);

    await client.close();

    // The bot's departure is asynchronous; poll the room count down.
    let open = await roomsOpen();
    for (let attempt = 0; attempt < 40 && open > 0; attempt += 1) {
      // oxlint-disable-next-line no-await-in-loop -- polling a count down
      await Bun.sleep(25);
      // oxlint-disable-next-line no-await-in-loop -- polling a count down
      open = await roomsOpen();
    }
    expect(open).toBe(0);
  });
});

describe("queue", () => {
  test("pairs two waiters into one room", async () => {
    const first = await harness.connect();
    await first.next("session.welcome");
    first.say({ type: "duel.queue", v: PROTOCOL_VERSION });
    const waiting = await first.next("duel.waiting");
    expect(waiting.seconds).toBe(0);

    const second = await harness.connect();
    await second.next("session.welcome");
    second.say({ type: "duel.queue", v: PROTOCOL_VERSION });

    const [a, b] = await Promise.all([
      first.next("duel.matched"),
      second.next("duel.matched"),
    ]);
    expect(a.roomId).toBe(b.roomId);
    expect(a.code).toBe(b.code);

    first.say({ roomId: a.roomId, type: "room.join", v: PROTOCOL_VERSION });
    second.say({ roomId: b.roomId, type: "room.join", v: PROTOCOL_VERSION });
    const counting = await first.until(
      "duel.snapshot",
      (message) => message.phase === "countdown"
    );
    expect(counting.players).toHaveLength(2);

    await second.close();
    await first.close();
  });

  test("keeps a waiter informed once a second", async () => {
    const client = await harness.connect();
    await client.next("session.welcome");
    client.say({ type: "duel.queue", v: PROTOCOL_VERSION });

    const later = await client.until(
      "duel.waiting",
      (message) => message.seconds >= 1,
      4000
    );
    expect(later.seconds).toBeGreaterThanOrEqual(1);

    await client.close();
  });

  test("forgets a waiter that stops waiting", async () => {
    const first = await harness.connect();
    await first.next("session.welcome");
    first.say({ type: "duel.queue", v: PROTOCOL_VERSION });
    await first.next("duel.waiting");
    first.say({ type: "duel.dequeue", v: PROTOCOL_VERSION });

    const second = await harness.connect();
    await second.next("session.welcome");
    second.say({ type: "duel.queue", v: PROTOCOL_VERSION });
    const waiting = await second.next("duel.waiting");

    // Nobody to pair with: the first left the line.
    expect(waiting.seconds).toBe(0);
    expect(
      first.received.some((message) => message.type === "duel.matched")
    ).toBe(false);

    await second.close();
    await first.close();
  });
});

describe("heartbeat", () => {
  test("drops a socket that says nothing", async () => {
    const quiet = startHarness({ idleTimeoutSeconds: 1 });
    try {
      const client = await quiet.connect();
      await client.next("session.welcome");

      const code = await client.closed;
      // Closed by the server, not by anything the client did.
      expect(code).not.toBe(1000);
    } finally {
      await quiet.close();
    }
  }, 10_000);
});
