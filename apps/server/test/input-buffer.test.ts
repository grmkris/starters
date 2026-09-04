import { describe, expect, test } from "bun:test";

import { createInputBuffer } from "../src/input-buffer";

describe("input buffer", () => {
  test("keeps the latest intent when a client sends twice in one window", () => {
    const buffer = createInputBuffer();
    buffer.capture("player-a", { x: 1, z: 0 });
    buffer.capture("player-a", { x: 0, z: -1 });

    expect(buffer.drain()).toEqual([
      { clientId: "player-a", input: { x: 0, z: -1 } },
    ]);
  });

  test("empties itself so a frame is consumed exactly once", () => {
    const buffer = createInputBuffer();
    buffer.capture("player-a", { x: 1, z: 0 });

    expect(buffer.drain()).toHaveLength(1);
    // A second step in the same catch-up run must not replay the frame; the
    // Movement trait already holds the direction.
    expect(buffer.drain()).toEqual([]);
  });

  test("orders a frame canonically rather than by arrival", () => {
    const buffer = createInputBuffer();
    buffer.capture("player-c", { x: 1, z: 0 });
    buffer.capture("player-a", { x: 0, z: 1 });
    buffer.capture("player-b", { x: -1, z: 0 });

    expect(buffer.drain().map((entry) => entry.clientId)).toEqual([
      "player-a",
      "player-b",
      "player-c",
    ]);
  });

  test("reports an empty frame when no client sent anything", () => {
    const buffer = createInputBuffer();

    expect(buffer.drain()).toEqual([]);
  });
});
