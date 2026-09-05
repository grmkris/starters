import { describe, expect, test } from "bun:test";

import { createDuelInputBuffer } from "../src/duel-input";

describe("duel input buffer", () => {
  test("keeps the latest lane target in a window", () => {
    const buffer = createDuelInputBuffer();
    buffer.move("a", 1);
    buffer.move("a", 2);

    expect(buffer.drain()).toEqual([
      { clientId: "a", fire: null, move: 2, rematch: false },
    ]);
  });

  test("keeps the first shot in a window and drops the second", () => {
    const buffer = createDuelInputBuffer();
    buffer.fire("a", 0.1);
    buffer.fire("a", 0.9);

    expect(buffer.drain()[0]?.fire).toBe(0.1);
  });

  test("records a rematch as a flag beside the other intent", () => {
    const buffer = createDuelInputBuffer();
    buffer.rematch("a");
    buffer.move("a", -1);

    expect(buffer.drain()).toEqual([
      { clientId: "a", fire: null, move: -1, rematch: true },
    ]);
  });

  test("empties itself and orders a frame canonically", () => {
    const buffer = createDuelInputBuffer();
    buffer.move("c", 0);
    buffer.move("a", 0);

    expect(buffer.drain().map((entry) => entry.clientId)).toEqual(["a", "c"]);
    expect(buffer.drain()).toEqual([]);
  });
});
