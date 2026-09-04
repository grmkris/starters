import { describe, expect, test } from "bun:test";

import { createSimulation } from "../src/index";

describe("authoritative simulation", () => {
  test("clamps input and advances on a fixed step", () => {
    const simulation = createSimulation();
    simulation.spawnPlayer("player-1");
    simulation.applyInput("player-1", { x: 100, z: 0 });
    simulation.step(1);

    expect(simulation.snapshot()).toEqual([
      {
        clientId: "player-1",
        position: { x: 3.5, y: 0.5, z: 0 },
      },
    ]);
  });

  test("removes disconnected players", () => {
    const simulation = createSimulation();
    simulation.spawnPlayer("player-1");
    simulation.removePlayer("player-1");

    expect(simulation.snapshot()).toEqual([]);
  });
});
