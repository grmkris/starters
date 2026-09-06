import { expect, test } from "bun:test";

import { createDinoRaceReplay } from "../src/lib/dinorace-replay";

test("manual input advances on fixed host ticks, not renderer reads, and clears on pause", () => {
  let now = 0;
  const session = createDinoRaceReplay(() => now);
  session.toggle();
  now = 1000;
  session.advance();
  expect(session.source.getFrame().speed).toBe(0);
  session.setControl("keyboard", "throttle", true);
  for (let i = 0; i < 60; i += 1) {
    now += 1000 / 60;
    session.advance();
  }
  expect(session.telemetry().frame.speed).toBeGreaterThan(5);
  const before = session.telemetry();
  for (let i = 0; i < 100; i += 1) {
    session.source.getFrame();
  }
  expect(session.telemetry()).toEqual(before);
  session.pause();
  now += 5000;
  session.advance();
  expect(session.telemetry().elapsed).toBe(before.elapsed);
  session.reset();
  session.toggle();
  now += 100;
  session.advance();
  expect(session.telemetry().frame.speed).toBe(0);
});

test("demo remains explicit, and changing modes resets manual input", () => {
  let now = 0;
  const session = createDinoRaceReplay(() => now);
  expect(session.telemetry().mode).toBe("drive");
  session.setMode("demo");
  session.toggle();
  now += 4000;
  expect(session.telemetry().frame.speed).toBeGreaterThan(0);
  session.setMode("drive");
  expect(session.telemetry().frame.speed).toBe(0);
  expect(session.telemetry().playing).toBe(false);
});

const runSteering = (direction: "left" | "right") => {
  let now = 0;
  const session = createDinoRaceReplay(() => now);
  session.toggle();
  session.setControl("thumb-throttle", "throttle", true);
  session.setControl("thumb-steer", direction, true);
  for (let tick = 0; tick < 60; tick += 1) {
    now += 1000 / 60;
    session.advance();
  }
  const { frame } = session.telemetry();
  // Forward is +Z. With world-up +Y, the driver's right is -X.
  expect(direction === "right" ? frame.x : -frame.x).toBeLessThan(-0.1);
  expect(frame.speed).toBeGreaterThan(5);
  session.setControl("thumb-steer", direction, false);
  now += 250;
  session.advance();
  expect(Math.abs(session.telemetry().frame.steeringAmount)).toBeLessThan(
    Math.abs(frame.steeringAmount)
  );
  expect(session.telemetry().frame.speed).toBeGreaterThan(frame.speed);
};

test("left and right steer to the driver's left and right, including simultaneous touch input", () => {
  runSteering("left");
  runSteering("right");
});
