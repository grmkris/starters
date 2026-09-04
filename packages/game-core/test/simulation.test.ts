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

  test("orders the snapshot canonically rather than by arrival", () => {
    const simulation = createSimulation();
    simulation.spawnPlayer("player-c");
    simulation.spawnPlayer("player-a");
    simulation.spawnPlayer("player-b");

    expect(simulation.snapshot().map((player) => player.clientId)).toEqual([
      "player-a",
      "player-b",
      "player-c",
    ]);
  });

  test("keeps snapshot order stable when a player leaves and rejoins", () => {
    const simulation = createSimulation();
    simulation.spawnPlayer("player-a");
    simulation.spawnPlayer("player-b");
    simulation.removePlayer("player-a");
    simulation.spawnPlayer("player-a");

    // Insertion order now ends with player-a, so an unsorted snapshot would
    // report the world differently before and after a reconnect.
    expect(simulation.snapshot().map((player) => player.clientId)).toEqual([
      "player-a",
      "player-b",
    ]);
  });

  test("removes disconnected players", () => {
    const simulation = createSimulation();
    simulation.spawnPlayer("player-1");
    simulation.removePlayer("player-1");

    expect(simulation.snapshot()).toEqual([]);
  });
});
