import { expect, test } from "bun:test";

import { raceDuration, racingLine, sampleRace } from "../src/race";

test("replay is seekable, bounded and finishes exactly one authored lap", () => {
  expect(sampleRace(0).speed).toBe(0);
  expect(sampleRace(raceDuration).positionAlongTrack).toBeCloseTo(1, 8);
  expect(sampleRace(raceDuration + 100)).toEqual(sampleRace(raceDuration));
  const ordered = Array.from({ length: 600 }, (_, i) => sampleRace(i / 60));
  for (let i = 599; i >= 0; i -= 1) {
    const expected = ordered[i];
    if (expected) {
      expect(sampleRace(i / 60)).toEqual(expected);
    }
  }
  expect(racingLine[0]).toEqual(racingLine.at(-1));
  expect(sampleRace(20).laneOffset).toBeGreaterThan(2);
  expect(sampleRace(28).phase).toBe("braking");
});
