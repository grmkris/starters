import { expect, test } from "bun:test";

import {
  createDinoDriveState,
  recoverDinoDrive,
  stepDinoDrive,
} from "../src/dinorace-driving";
import { racingLine } from "../src/race";

const idle = { throttle: 0, brake: 0, steering: 0 };
test("driving needs throttle, steers freely, brakes, and replays deterministically", () => {
  let stationary = createDinoDriveState();
  for (let i = 0; i < 120; i += 1) {
    stationary = stepDinoDrive(stationary, idle);
  }
  expect(stationary.speed).toBe(0);
  expect(stationary.z).toBe(0);
  const run = () => {
    let state = createDinoDriveState();
    for (let i = 0; i < 120; i += 1) {
      state = stepDinoDrive(state, { ...idle, throttle: 1 });
    }
    return state;
  };
  const moving = run();
  expect(moving).toEqual(run());
  expect(moving.z).toBeGreaterThan(8);
  expect(moving.speed).toBeGreaterThan(8);
  let turning = moving;
  for (let i = 0; i < 20; i += 1) {
    turning = stepDinoDrive(turning, { ...idle, steering: 1 });
  }
  expect(turning.heading).toBeGreaterThan(moving.heading + 0.1);
  expect(turning.x).toBeGreaterThan(moving.x + 0.1);
  let braking = moving;
  for (let i = 0; i < 120; i += 1) {
    braking = stepDinoDrive(braking, { ...idle, brake: 1 });
  }
  expect(braking.speed).toBe(0);
});

test("track boundaries constrain the car and recovery cannot award a lap", () => {
  let state = createDinoDriveState();
  for (let i = 0; i < 1200; i += 1) {
    state = stepDinoDrive(state, { throttle: 1, brake: 0, steering: 1 });
    expect(Math.abs(state.laneOffset)).toBeLessThanOrEqual(5.4);
    expect(Number.isFinite(state.x + state.z + state.heading)).toBe(true);
  }
  const recovered = recoverDinoDrive(state);
  expect(recovered.speed).toBe(0);
  expect(recovered.laneOffset).toBe(0);
  expect(recovered.laps).toBe(state.laps);
  expect(recovered.lapSeconds).toBeGreaterThanOrEqual(state.lapSeconds);
});

test("untrusted numeric intent is bounded without poisoning simulation state", () => {
  const state = stepDinoDrive(createDinoDriveState(), {
    throttle: Number.NaN,
    brake: Number.POSITIVE_INFINITY,
    steering: -200,
  });
  expect(Number.isFinite(state.speed + state.heading)).toBe(true);
  expect(state.speed).toBe(0);
});

test("a full forward circuit crosses ordered checkpoints and records a timed lap", () => {
  let state = createDinoDriveState();
  for (let tick = 0; tick < 3600 && state.laps === 0; tick += 1) {
    let nearest = 0;
    let distance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < racingLine.length - 1; index += 1) {
      const point = racingLine[index];
      if (!point) {
        continue;
      }
      const squared = (point.x - state.x) ** 2 + (point.z - state.z) ** 2;
      if (squared < distance) {
        nearest = index;
        distance = squared;
      }
    }
    const target = racingLine[(nearest + 14) % (racingLine.length - 1)];
    if (!target) {
      throw new Error("Missing racing line point");
    }
    const angle =
      Math.atan2(target.x - state.x, target.z - state.z) - state.heading;
    const length = Math.hypot(target.x - state.x, target.z - state.z);
    const wheel = Math.atan2(8.8 * Math.sin(angle), length);
    state = stepDinoDrive(state, {
      throttle: state.speed < 12 ? 1 : 0,
      brake: 0,
      steering: wheel / (0.52 / (1 + state.speed / 35)),
    });
  }
  expect(state.laps).toBe(1);
  expect(state.lastLap).toBeGreaterThan(10);
  expect(state.bestLap).toBe(state.lastLap);
  expect(state.checkpoint).toBe(0);
});
