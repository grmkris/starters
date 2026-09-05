import { afterEach, describe, expect, test } from "bun:test";

import {
  COUNTDOWN_SECONDS,
  createDuelSimulation,
  FIELD_HALF_WIDTH,
  FIRE_COOLDOWN_SECONDS,
  HITS_TO_KILL,
  LANE_HALF_HEIGHT,
  MAX_FIRE_ANGLE,
  PLAYER_RADIUS,
  ROUND_OVER_SECONDS,
} from "../src/index";
import type { DuelSimulation, DuelSnapshot } from "../src/index";

const TICK = 1 / 20;
const A = "player-a";
const B = "player-b";

/**
 * Koota hands out sixteen world ids and reclaims one only on dispose, so every
 * simulation a test makes is released after it, or the seventeenth test fails
 * for a reason that has nothing to do with what it checks.
 */
const created: DuelSimulation[] = [];

const create = (): DuelSimulation => {
  const simulation = createDuelSimulation();
  created.push(simulation);
  return simulation;
};

afterEach(() => {
  for (const simulation of created) {
    simulation.dispose();
  }
  created.length = 0;
});

const advance = (simulation: DuelSimulation, seconds: number): void => {
  const ticks = Math.round(seconds / TICK);
  for (let tick = 0; tick < ticks; tick += 1) {
    simulation.step(TICK);
  }
};

/** Two players seated and the countdown run down, so shots are legal. */
const playing = (): DuelSimulation => {
  const simulation = create();
  simulation.join(A);
  simulation.join(B);
  advance(simulation, COUNTDOWN_SECONDS);
  return simulation;
};

const player = (snapshot: DuelSnapshot, clientId: string) => {
  const found = snapshot.players.find((entry) => entry.clientId === clientId);
  if (found === undefined) {
    throw new Error(`${clientId} is not in the duel`);
  }
  return found;
};

/** Fires every tick until the round is over or `seconds` have passed. */
const shootUntilRoundOver = (
  simulation: DuelSimulation,
  shooter: string,
  seconds: number
): void => {
  const ticks = Math.round(seconds / TICK);
  for (let tick = 0; tick < ticks; tick += 1) {
    if (simulation.snapshot().phase !== "playing") {
      return;
    }
    simulation.fire(shooter, 0);
    simulation.step(TICK);
  }
};

describe("seating", () => {
  test("seats the first player on the left, the second on the right, and no third", () => {
    const simulation = create();

    expect(simulation.join(A)).toBe(-1);
    expect(simulation.join(B)).toBe(1);
    expect(simulation.join("player-c")).toBeNull();
    expect(simulation.join(A)).toBe(-1);
  });

  test("waits alone, counts down once both are seated, then plays", () => {
    const simulation = create();
    simulation.join(A);
    expect(simulation.snapshot().phase).toBe("waiting");

    simulation.join(B);
    expect(simulation.snapshot().phase).toBe("countdown");
    expect(simulation.snapshot().countdown).toBe(COUNTDOWN_SECONDS);

    advance(simulation, COUNTDOWN_SECONDS);
    expect(simulation.snapshot().phase).toBe("playing");
  });

  test("voids the match when a player leaves", () => {
    const simulation = playing();
    simulation.fire(A, 0);
    simulation.move(B, 3);
    advance(simulation, 0.5);

    simulation.leave(A);
    const after = simulation.snapshot();

    expect(after.phase).toBe("waiting");
    expect(after.projectiles).toEqual([]);
    expect(player(after, B).position.z).toBe(0);
  });
});

describe("movement", () => {
  test("moves toward the target at lane speed", () => {
    const simulation = playing();
    simulation.move(A, 4);
    advance(simulation, 0.5);

    // Six units a second for half a second.
    expect(player(simulation.snapshot(), A).position.z).toBeCloseTo(3, 6);
  });

  test("stops inside the lane however far the target is", () => {
    const simulation = playing();
    simulation.move(A, 100);
    advance(simulation, 3);

    expect(player(simulation.snapshot(), A).position.z).toBeCloseTo(
      LANE_HALF_HEIGHT - PLAYER_RADIUS,
      6
    );
  });

  test("does not move before the countdown ends", () => {
    const simulation = create();
    simulation.join(A);
    simulation.join(B);
    simulation.move(A, 4);
    advance(simulation, 1);

    expect(player(simulation.snapshot(), A).position.z).toBe(0);
  });
});

describe("shooting", () => {
  test("a straight shot crosses the seam into the other lane", () => {
    const simulation = playing();
    simulation.fire(A, 0);
    const [first] = simulation.snapshot().projectiles;
    expect(first?.position.x).toBeLessThan(0);

    advance(simulation, 0.6);

    const [crossed] = simulation.snapshot().projectiles;
    expect(crossed?.position.x).toBeGreaterThan(0);
  });

  test("refuses a second shot inside the cooldown", () => {
    const simulation = playing();
    simulation.fire(A, 0);
    simulation.fire(A, 0);
    expect(simulation.snapshot().projectiles).toHaveLength(1);

    advance(simulation, FIRE_COOLDOWN_SECONDS);
    simulation.fire(A, 0);
    expect(simulation.snapshot().projectiles).toHaveLength(2);
  });

  test("banks once off the lane wall and dies on the second", () => {
    const simulation = playing();
    // Near the top wall, firing up at the widest angle: the first wall is
    // close, the second comes before the far edge.
    simulation.move(A, LANE_HALF_HEIGHT);
    advance(simulation, 1);
    simulation.fire(A, MAX_FIRE_ANGLE);
    const [fired] = simulation.snapshot().projectiles;
    expect(fired?.velocity.z).toBeGreaterThan(0);

    let banked = false;
    let died = false;
    let lastX = 0;
    for (let tick = 0; tick < 60 && !died; tick += 1) {
      simulation.step(TICK);
      const [projectile] = simulation.snapshot().projectiles;
      if (projectile === undefined) {
        died = true;
      } else {
        banked ||= projectile.velocity.z < 0;
        lastX = projectile.position.x;
      }
    }

    expect(banked).toBe(true);
    expect(died).toBe(true);
    // Gone before the far edge, so the wall took it rather than the field.
    expect(lastX).toBeLessThan(FIELD_HALF_WIDTH - 1);
  });

  test("a hit costs the opponent one health and ends the shot", () => {
    const simulation = playing();
    simulation.fire(A, 0);
    advance(simulation, 1.2);

    const after = simulation.snapshot();
    expect(player(after, B).health).toBe(HITS_TO_KILL - 1);
    expect(player(after, A).health).toBe(HITS_TO_KILL);
    expect(after.projectiles).toEqual([]);
  });

  test("a shot never hits its own shooter", () => {
    const simulation = playing();
    // A shot spawns touching its shooter, so the first step's segment starts
    // inside their hit radius; only the opponent is ever tested.
    simulation.fire(A, 0);
    simulation.step(TICK);

    expect(player(simulation.snapshot(), A).health).toBe(HITS_TO_KILL);
  });
});

describe("rounds and the match", () => {
  test("three hits win the round and the result holds for two seconds", () => {
    const simulation = playing();
    shootUntilRoundOver(simulation, A, 5);

    const over = simulation.snapshot();
    expect(over.phase).toBe("roundOver");
    expect(over.winner).toBe(-1);
    expect(player(over, A).rounds).toBe(1);
    expect(over.projectiles).toEqual([]);

    advance(simulation, ROUND_OVER_SECONDS);
    const next = simulation.snapshot();
    expect(next.phase).toBe("countdown");
    expect(next.round).toBe(2);
    expect(player(next, B).health).toBe(HITS_TO_KILL);
  });

  test("two rounds win the match, and a rematch needs both", () => {
    const simulation = playing();
    shootUntilRoundOver(simulation, A, 5);
    advance(simulation, ROUND_OVER_SECONDS + COUNTDOWN_SECONDS);
    shootUntilRoundOver(simulation, A, 5);
    advance(simulation, ROUND_OVER_SECONDS);

    const over = simulation.snapshot();
    expect(over.phase).toBe("matchOver");
    expect(over.winner).toBe(-1);

    simulation.rematch(A);
    expect(simulation.snapshot().phase).toBe("matchOver");

    simulation.rematch(B);
    const fresh = simulation.snapshot();
    expect(fresh.phase).toBe("countdown");
    expect(fresh.round).toBe(1);
    expect(player(fresh, A).rounds).toBe(0);
    expect(player(fresh, A).rematch).toBe(false);
  });

  test("ignores shots outside play", () => {
    const simulation = create();
    simulation.join(A);
    simulation.join(B);
    simulation.fire(A, 0);

    expect(simulation.snapshot().projectiles).toEqual([]);
  });
});

describe("determinism", () => {
  test("identical inputs produce identical snapshots", () => {
    const script = (simulation: DuelSimulation): DuelSnapshot[] => {
      const frames: DuelSnapshot[] = [];
      simulation.join(A);
      simulation.join(B);
      for (let tick = 0; tick < 120; tick += 1) {
        if (tick % 7 === 0) {
          simulation.move(A, (tick % 5) - 2);
        }
        if (tick % 11 === 0) {
          simulation.fire(A, 0.3);
        }
        if (tick % 13 === 0) {
          simulation.fire(B, -0.2);
        }
        simulation.step(TICK);
        frames.push(simulation.snapshot());
      }
      return frames;
    };

    const first = create();
    const second = create();

    expect(script(first)).toEqual(script(second));
  });

  test("releases its world so a host can outlive sixteen of them", () => {
    expect(() => {
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const simulation = createDuelSimulation();
        simulation.join(A);
        simulation.step(TICK);
        simulation.dispose();
      }
    }).not.toThrow();
  });
});
