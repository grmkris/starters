import { describe, expect, test } from "bun:test";

import { DUEL_FIELD } from "@agent-native/domain";
import {
  FIELD_HALF_WIDTH,
  LANE_HALF_HEIGHT,
  MAX_FIRE_ANGLE,
  PLAYER_X,
} from "@agent-native/game-core";

/**
 * The client draws the field from the domain's numbers and the rules run on
 * game-core's, and the two packages may not import each other. This is the
 * only place both are visible, so this is where they are held equal.
 */
describe("duel field", () => {
  test("is the same rectangle to the renderer and to the rules", () => {
    expect(DUEL_FIELD.halfWidth).toBe(FIELD_HALF_WIDTH);
    expect(DUEL_FIELD.laneHalfHeight).toBe(LANE_HALF_HEIGHT);
    expect(DUEL_FIELD.maxFireAngle).toBe(MAX_FIRE_ANGLE);
    expect(DUEL_FIELD.playerX).toBe(PLAYER_X);
  });
});
