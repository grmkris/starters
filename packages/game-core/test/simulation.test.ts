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

  test("caps diagonal input at full speed rather than per axis", () => {
    const simulation = createSimulation();
    simulation.spawnPlayer("player-1");
    // W and D together: the keyboard's diagonal.
    simulation.applyInput("player-1", { x: 1, z: 1 });
    simulation.step(1);

    const [player] = simulation.snapshot();
    const travelled = Math.hypot(
      player?.position.x ?? 0,
      player?.position.z ?? 0
    );
    // Clamping each axis to the unit range let a diagonal travel √2 times
    // further per second than a straight line, and the thumbstick, which
    // clamps to the unit circle, could never match it.
    expect(travelled).toBeCloseTo(3.5, 6);
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

describe("simulation lifetime", () => {
  test("returns its world so a host can outlive sixteen of them", () => {
    // Koota allocates world ids from a pool of sixteen and reclaims one only on
    // destroy. Without dispose this throws "Too many worlds created" on the
    // seventeenth iteration, so the count is the assertion.
    expect(() => {
      for (let created = 0; created < 24; created += 1) {
        const simulation = createSimulation();
        simulation.spawnPlayer(`player-${created}`);
        simulation.step(1 / 20);
        simulation.dispose();
      }
    }).not.toThrow();
  });
});
