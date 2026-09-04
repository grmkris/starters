import { describe, expect, test } from "bun:test";

import { Duration, Effect, Schedule } from "effect";

import { reconnectSchedule } from "../src/lib/realtime-client";

/** Nominal ceiling, before `Schedule.jittered` scales a delay by 0.8x - 1.2x. */
const CEILING_MS = 10_000;
const JITTER_MAX = 1.2;

const delaysFor = async (attempts: number): Promise<number[]> =>
  await Effect.runPromise(
    Effect.gen(function* collect() {
      const step = yield* Schedule.toStep(reconnectSchedule);
      const delays: number[] = [];
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const [, duration] = yield* step(0, null);
        delays.push(Duration.toMillis(duration));
      }
      return delays;
    })
  );

describe("reconnect schedule", () => {
  test("caps the delay instead of growing without bound", async () => {
    const delays = await delaysFor(20);

    // Uncapped exponential from 400ms reaches ~13 minutes by attempt 12 and
    // several hours by attempt 16, which reads to a user as "stopped trying".
    for (const delay of delays) {
      expect(delay).toBeLessThanOrEqual(CEILING_MS * JITTER_MAX);
    }
  });

  test("still backs off early rather than hammering the server", async () => {
    const [first] = await delaysFor(1);

    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(CEILING_MS);
  });

  test("reaches the ceiling rather than stalling at the base delay", async () => {
    const delays = await delaysFor(20);
    const last = delays.at(-1) ?? 0;

    expect(last).toBeGreaterThan(CEILING_MS / 2);
  });
});
