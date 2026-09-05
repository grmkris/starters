import { createWorld } from "koota";
import type { Entity, World } from "koota";

import { Movement, Player, Position } from "./traits";

export {
  COUNTDOWN_SECONDS,
  createDuelSimulation,
  FIELD_HALF_WIDTH,
  FIRE_COOLDOWN_SECONDS,
  HITS_TO_KILL,
  LANE_HALF_HEIGHT,
  MAX_FIRE_ANGLE,
  PLAYER_RADIUS,
  PLAYER_X,
  PROJECTILE_SPEED,
  ROUND_OVER_SECONDS,
  ROUNDS_TO_WIN,
} from "./duel";
export type {
  DuelPhase,
  DuelPlayerState,
  DuelSimulation,
  DuelSnapshot,
  ProjectileState,
  Side,
} from "./duel";
export { Movement, Player, Position } from "./traits";

const MAX_SPEED = 3.5;

/**
 * `Id` lets a host narrow the client identifier to its own branded type
 * (`ClientId` in this repository) without this package importing the domain,
 * which the boundary check forbids. It defaults to `string` so the simulation
 * stays usable on its own in tests and replay tools.
 */
export interface PlayerState<Id extends string = string> {
  readonly clientId: Id;
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
}

export interface Simulation<Id extends string = string> {
  readonly world: World;
  readonly spawnPlayer: (clientId: Id) => void;
  readonly removePlayer: (clientId: Id) => void;
  readonly applyInput: (
    clientId: Id,
    input: { readonly x: number; readonly z: number }
  ) => void;
  readonly step: (deltaSeconds: number) => void;
  readonly snapshot: () => readonly PlayerState<Id>[];
  /**
   * Releases the underlying world. Koota allocates world ids from a fixed pool
   * of sixteen and reclaims one only on destroy, so a host that creates a
   * simulation per room and never disposes runs out at the seventeenth.
   */
  readonly dispose: () => void;
}

export const createSimulation = <
  Id extends string = string,
>(): Simulation<Id> => {
  const world = createWorld();
  const players = new Map<Id, Entity>();

  const spawnPlayer = (clientId: Id): void => {
    if (players.has(clientId)) {
      return;
    }

    const offset = players.size * 1.5;
    const entity = world.spawn(
      Player({ clientId }),
      Position({ x: offset, y: 0.5, z: 0 }),
      Movement
    );
    players.set(clientId, entity);
  };

  const removePlayer = (clientId: Id): void => {
    const entity = players.get(clientId);
    if (!entity) {
      return;
    }

    entity.destroy();
    players.delete(clientId);
  };

  const applyInput = (
    clientId: Id,
    input: { readonly x: number; readonly z: number }
  ): void => {
    const entity = players.get(clientId);
    if (!entity) {
      return;
    }
    // Bounded by magnitude, not per axis, so `MAX_SPEED` is the speed in every
    // direction. Clamping each axis to the unit range let W+D travel √2 times
    // faster than W alone, and a control that reports a unit circle - the
    // thumbstick - could never match it. A vector inside the circle is an
    // analogue stick's partial deflection and passes through unchanged.
    const magnitude = Math.hypot(input.x, input.z);
    const scale = magnitude > 1 ? 1 / magnitude : 1;
    entity.set(Movement, { x: input.x * scale, z: input.z * scale });
  };

  const step = (deltaSeconds: number): void => {
    world.query(Position, Movement).updateEach(([position, movement]) => {
      position.x += movement.x * MAX_SPEED * deltaSeconds;
      position.z += movement.z * MAX_SPEED * deltaSeconds;
    });
  };

  // Iterating the player map rather than querying the `Player` trait keeps the
  // caller's identifier type: trait storage is declared as a plain string, so
  // reading `clientId` back out of the world would lose the `Id` narrowing.
  const snapshot = (): readonly PlayerState<Id>[] => {
    const state: PlayerState<Id>[] = [];
    for (const [clientId, entity] of players) {
      const position = entity.get(Position);
      if (!position) {
        continue;
      }
      state.push({
        clientId,
        position: { x: position.x, y: position.y, z: position.z },
      });
    }

    // Sorted so the array is a canonical view of the world rather than a record
    // of arrival. Map iteration follows insertion order, so two simulations
    // holding identical state that saw their joins in a different order would
    // otherwise produce different snapshots, and anything comparing snapshots -
    // a replay checking itself tick by tick - would read that as a divergence.
    return state.toSorted((left, right) =>
      left.clientId < right.clientId ? -1 : 1
    );
  };

  const dispose = (): void => {
    players.clear();
    world.destroy();
  };

  return {
    applyInput,
    dispose,
    removePlayer,
    snapshot,
    spawnPlayer,
    step,
    world,
  };
};
