import { describe, expect, test } from "bun:test";

import { fitLane } from "../src/lane-fit";

const lane = { length: 8.7, width: 4 };

/** The lane's two edges across it, in units, as the screen shows them. */
const shown = (screen: { across: number; along: number }, side: -1 | 1) => {
  const { cameraX, zoom } = fitLane(screen, lane, side);
  const half = screen.across / zoom / 2;
  return { far: cameraX + side * half, near: cameraX - side * half };
};

describe("lane fit", () => {
  test("a phone held sideways fits the lane by its depth, seam on the edge", () => {
    const screen = { across: 285, along: 750 };
    const { cameraX, zoom } = fitLane(screen, lane, -1);

    expect(zoom).toBeCloseTo(285 / 4);
    expect(cameraX).toBeCloseTo(-2);
    expect(shown(screen, -1)).toEqual({ far: -4, near: 0 });
  });

  test("a wide window fits the lane by its length and keeps the seam on the edge", () => {
    const screen = { across: 656, along: 1280 };
    const { zoom } = fitLane(screen, lane, 1);

    // The whole length is on screen, and so is the wall behind the player.
    expect(zoom * lane.length).toBeLessThanOrEqual(1280);
    const { far, near } = shown(screen, 1);
    expect(near).toBeCloseTo(0);
    expect(far).toBeGreaterThan(lane.width);
  });

  test("a phone held upright shows the whole lane, ends included", () => {
    const screen = { across: 390, along: 780 };
    const { zoom } = fitLane(screen, lane, -1);

    expect(zoom * lane.length).toBeLessThanOrEqual(780);
    expect(zoom * lane.width).toBeLessThanOrEqual(390);
    expect(shown(screen, -1).near).toBeCloseTo(0);
  });

  test("a canvas with no size yet gets something finite", () => {
    expect(fitLane({ across: 0, along: 0 }, lane, 1)).toEqual({
      cameraX: 2,
      zoom: 1,
    });
  });
});
