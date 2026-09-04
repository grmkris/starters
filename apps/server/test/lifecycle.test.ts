import { describe, expect, test } from "bun:test";

import { startHarness } from "./harness";

/**
 * Koota allocates world ids from a pool of 16 and returns one only on
 * `world.destroy()`. The server never called it: shutdown cleared the interval,
 * stopped the socket and closed the ledger, and left the world allocated.
 *
 * That was invisible while a process held one world for its lifetime. It stops
 * being invisible the moment a room owns a world, and it showed up first here -
 * the seventeenth harness in a run could not start.
 */

describe("server lifecycle", () => {
  test("releases its world so a process can outlive the world pool", async () => {
    // Comfortably past Koota's limit of 16. Sequential on purpose: the point is
    // that each world is returned before the next is taken, and Promise.all
    // would allocate all 24 at once and fail for the reason under test.
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const harness = startHarness();
      expect(harness.port).toBeGreaterThan(0);
      // oxlint-disable-next-line eslint/no-await-in-loop -- see above
      await harness.close();
    }
  });

  test("stops listening once disposed", async () => {
    const harness = startHarness();
    const { port } = harness;
    const healthy = await fetch(`http://127.0.0.1:${port}/health`);
    expect(healthy.ok).toBe(true);

    await harness.close();

    expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toThrow();
  });
});
