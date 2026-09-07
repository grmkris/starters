import { expect, test } from "bun:test";

import { sampleZelenoPose } from "../src/zeleno-motion";

const poseAt = (time: number) => {
  const pose = { x: 0, y: 0, z: 0, grip: 1, item: 0, carrying: false };
  sampleZelenoPose(time, pose);
  return pose;
};

test("robot remains continuous and reachable across every phase boundary", () => {
  let previous = poseAt(0);
  let pickups = 0;
  let drops = 0;
  for (let frame = 1; frame <= 22 * 120; frame += 1) {
    const next = poseAt(frame / 120);
    expect(
      Math.hypot(next.x - previous.x, next.y - previous.y, next.z - previous.z)
    ).toBeLessThan(0.07);
    expect(Math.hypot(next.y - 2.13, next.z - 0.03)).toBeLessThan(1.7);
    if (next.carrying && !previous.carrying) {
      pickups += 1;
    }
    if (!next.carrying && previous.carrying) {
      drops += 1;
    }
    previous = next;
  }
  expect(pickups).toBe(3);
  expect(drops).toBe(3);
});

test("produce transfers at the shelf and box height without a floating handoff", () => {
  for (let item = 0; item < 3; item += 1) {
    const picked = poseAt(4.35 + item * 4 + 0.000001);
    expect(picked.carrying).toBe(true);
    expect(picked.y - 0.18).toBeCloseTo(1.32, 4);
    expect(picked.z).toBeCloseTo(-0.685, 4);
    const placed = poseAt(6.35 + item * 4 + 0.000001);
    expect(placed.carrying).toBe(false);
    expect(placed.y - 0.18).toBeCloseTo(1.065, 4);
    expect(placed.x).toBeCloseTo(1.83 + item * 0.22, 4);
  }
});

test("seeking back from delivery restores the idle pose", () => {
  const pose = poseAt(21);
  sampleZelenoPose(0, pose);
  expect(pose).toEqual(poseAt(0));
});
