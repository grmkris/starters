import { describe, expect, test } from "bun:test";

import { createTickPacer } from "../src/tick-pacer";

const TICK_MS = 50;

/**
 * What the loop did before: exactly one step per timer firing, however late that
 * firing arrived. Kept here so each test compares the fix against the fault
 * rather than restating the new behaviour.
 */
const naiveTicks = (firings: number): number => firings;

describe("tick pacer", () => {
  test("runs one tick when a firing arrives on time", () => {
    const pacer = createTickPacer(TICK_MS);

    expect(pacer.advance(TICK_MS)).toBe(1);
  });

  test("runs the ticks a late firing owes instead of dropping them", () => {
    const pacer = createTickPacer(TICK_MS);

    // The timer fired once, but three periods of real time went by.
    expect(pacer.advance(TICK_MS * 3)).toBe(3);
    expect(naiveTicks(1)).toBe(1);
  });

  test("carries the remainder across firings", () => {
    const pacer = createTickPacer(TICK_MS);

    // Neither firing is a whole period, but together they are one plus change.
    expect(pacer.advance(30)).toBe(0);
    expect(pacer.advance(30)).toBe(1);
    // The leftover 10ms is still owed, so a 40ms firing completes it.
    expect(pacer.advance(40)).toBe(1);
  });

  test("clamps a suspend instead of running every tick in the gap", () => {
    const pacer = createTickPacer(TICK_MS, 5);

    // Ten minutes of elapsed time is 12,000 ticks. Running them in one callback
    // would block the thread for longer than the gap it is catching up on.
    expect(pacer.advance(10 * 60 * 1000)).toBe(5);
  });

  test("tracks elapsed real time across a run of late firings", () => {
    const pacer = createTickPacer(TICK_MS);
    const firings = 100;
    const lateBy = 15;
    const elapsedPerFiring = TICK_MS + lateBy;

    let owed = 0;
    for (let firing = 0; firing < firings; firing += 1) {
      owed += pacer.advance(elapsedPerFiring);
    }

    const realElapsed = firings * elapsedPerFiring;
    const deserved = Math.floor(realElapsed / TICK_MS);

    // The property that matters: simulated time follows real time.
    expect(owed).toBe(deserved);
    // The old loop lost 30% of it, which is what "runs slow under load" meant.
    expect(naiveTicks(firings)).toBeLessThan(deserved);
  });
});
