import { describe, expect, test } from "bun:test";

import { Vector3 } from "three";

import { obliqueShear } from "../src/oblique";

const K = 0.35;

describe("oblique shear", () => {
  test("leaves every ground point where it is", () => {
    const shear = obliqueShear(K);
    const seam = new Vector3(0, 0, 4.35).applyMatrix4(shear);
    const corner = new Vector3(-4, 0, -4.35).applyMatrix4(shear);

    expect([seam.x, seam.y, seam.z]).toEqual([0, 0, 4.35]);
    expect([corner.x, corner.y, corner.z]).toEqual([-4, 0, -4.35]);
  });

  test("slides a raised point up the screen by k per unit of height", () => {
    const top = new Vector3(1, 1, 2).applyMatrix4(obliqueShear(K));

    // Screen-up is -z, so up the screen is a smaller z.
    expect(top.x).toBe(1);
    expect(top.y).toBe(1);
    expect(top.z).toBeCloseTo(2 - K, 10);
  });

  test("with no lean, is the identity", () => {
    const point = new Vector3(2, 3, -1).applyMatrix4(obliqueShear(0));

    expect([point.x, point.y, point.z]).toEqual([2, 3, -1]);
  });
});
