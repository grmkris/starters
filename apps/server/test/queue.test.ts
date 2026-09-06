import { describe, expect, test } from "bun:test";

import { createQueue } from "../src/queue";

const clock = () => {
  let at = 0;
  return {
    advance: (ms: number): void => {
      at += ms;
    },
    now: (): number => at,
  };
};

describe("queue", () => {
  test("holds the first arrival and pairs the second with it", () => {
    const queue = createQueue<string>();

    expect(queue.enqueue("a")).toBeNull();
    expect(queue.enqueue("b")).toEqual(["a", "b"]);
    expect(queue.size()).toBe(0);
  });

  test("pairs in arrival order", () => {
    const queue = createQueue<string>();
    queue.enqueue("a");
    queue.enqueue("b");
    queue.enqueue("c");

    expect(queue.enqueue("d")).toEqual(["c", "d"]);
  });

  test("reports how long each entry has waited", () => {
    const time = clock();
    const queue = createQueue<string>(time.now);
    queue.enqueue("a");
    time.advance(15_400);

    expect(queue.waiting()).toEqual([{ entry: "a", seconds: 15 }]);
  });

  test("forgets an entry that stops waiting", () => {
    const queue = createQueue<string>();
    queue.enqueue("a");
    queue.dequeue("a");

    expect(queue.enqueue("b")).toBeNull();
  });

  test("does not queue the same entry twice", () => {
    const queue = createQueue<string>();
    queue.enqueue("a");

    expect(queue.enqueue("a")).toBeNull();
    expect(queue.size()).toBe(1);
  });
});
