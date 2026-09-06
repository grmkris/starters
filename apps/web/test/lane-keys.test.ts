import { describe, expect, test } from "bun:test";

import type { DuelLayout } from "@agent-native/game-three";

import { createMoveSender } from "../src/lib/lane-control";
import { createLaneKeys } from "../src/lib/lane-keys";

const MAX_FIRE_ANGLE = Math.PI / 3;
const BANK = Math.PI / 4;

const keysOn = (layout: DuelLayout, z = 0, maxFireAngle = MAX_FIRE_ANGLE) =>
  createLaneKeys({
    currentZ: () => z,
    laneHalfHeight: 4.35,
    layout,
    maxFireAngle,
    playerSpeed: 6,
  });

describe("lane keys", () => {
  test("held sideways, right runs the target toward -z at the rules' speed", () => {
    const keys = keysOn("landscape");

    expect(keys.press("ArrowRight")).toEqual({ fire: null, handled: true });
    expect(keys.moving()).toBe(true);
    expect(keys.tick(0.5)).toBeCloseTo(-3);

    keys.release("ArrowRight");
    expect(keys.moving()).toBe(false);
    expect(keys.tick(0.5)).toBeNull();
    expect(keys.target()).toBeCloseTo(-3);
  });

  test("upright, down is +z and the wall stops it", () => {
    const keys = keysOn("portrait");

    keys.press("ArrowDown");
    expect(keys.tick(2)).toBe(4.35);
  });

  test("WASD doubles the arrows", () => {
    const sideways = keysOn("landscape");
    sideways.press("KeyA");
    expect(sideways.tick(0.1)).toBeCloseTo(0.6);

    const upright = keysOn("portrait");
    upright.press("KeyW");
    expect(upright.tick(0.1)).toBeCloseTo(-0.6);
  });

  test("a move starts from where the player is, not from an old target", () => {
    let z = 1.5;
    const keys = createLaneKeys({
      currentZ: () => z,
      laneHalfHeight: 4.35,
      layout: "landscape",
      maxFireAngle: MAX_FIRE_ANGLE,
      playerSpeed: 6,
    });

    keys.press("ArrowLeft");
    expect(keys.tick(0.1)).toBeCloseTo(2.1);
    keys.release("ArrowLeft");

    z = -2;
    keys.press("ArrowLeft");
    expect(keys.tick(0.1)).toBeCloseTo(-1.4);
  });

  test("the latest key wins, and letting it go hands back to the other", () => {
    const keys = keysOn("landscape");

    keys.press("ArrowLeft");
    keys.press("ArrowRight");
    expect(keys.tick(0.1)).toBeCloseTo(-0.6);

    keys.release("ArrowRight");
    expect(keys.tick(0.1)).toBeCloseTo(0);
    expect(keys.moving()).toBe(true);
  });

  test("a key held down repeats without restarting the move", () => {
    const keys = keysOn("landscape");

    keys.press("ArrowRight");
    keys.tick(0.5);
    expect(keys.press("ArrowRight")).toEqual({ fire: null, handled: true });
    expect(keys.tick(0.5)).toBeCloseTo(-6 + 1.65);
  });

  test("keys across the lane, and any other key, mean nothing", () => {
    expect(keysOn("landscape").press("ArrowUp").handled).toBe(false);
    expect(keysOn("portrait").press("ArrowLeft").handled).toBe(false);
    expect(keysOn("portrait").press("KeyX").handled).toBe(false);
  });

  test("space fires straight; Q and E bank toward the screen's start and end", () => {
    const sideways = keysOn("landscape");
    expect(sideways.press("Space").fire).toBe(0);
    expect(sideways.press("Enter").fire).toBe(0);
    // Left is +z when the lane runs across the screen.
    expect(sideways.press("KeyQ").fire).toBeCloseTo(BANK);
    expect(sideways.press("KeyE").fire).toBeCloseTo(-BANK);

    const upright = keysOn("portrait");
    // Up is -z when the lane runs down the screen.
    expect(upright.press("KeyQ").fire).toBeCloseTo(-BANK);
    expect(upright.press("KeyE").fire).toBeCloseTo(BANK);
  });

  test("a banked shot never exceeds the widest the rules allow", () => {
    const keys = keysOn("landscape", 0, 0.5);
    expect(keys.press("KeyQ").fire).toBeCloseTo(0.5);
  });

  test("a shot does not touch the move", () => {
    const keys = keysOn("landscape");
    keys.press("ArrowRight");
    keys.press("Space");
    expect(keys.moving()).toBe(true);
    expect(keys.tick(0.1)).toBeCloseTo(-0.6);
  });
});

describe("move sender", () => {
  test("sends at most once per tick, unless forced, and never the same target twice", () => {
    let now = 1000;
    const delivered: number[] = [];
    const sender = createMoveSender(
      (target) => {
        delivered.push(target);
      },
      () => now
    );

    sender.send(1, false);
    now += 10;
    sender.send(1.2, false);
    expect(delivered).toEqual([1]);

    sender.send(1.2, true);
    expect(delivered).toEqual([1, 1.2]);

    now += 100;
    sender.send(1.2, false);
    expect(delivered).toEqual([1, 1.2]);

    sender.send(1.23, false);
    expect(delivered).toEqual([1, 1.2, 1.25]);
  });
});
