import { createWorld, trait } from "koota";
import type { Entity, World } from "koota";

const MAX_SPEED = 3.5;

export const Player = trait({ clientId: "" });
export const Position = trait({ x: 0, y: 0.5, z: 0 });
export const Movement = trait({ x: 0, z: 0 });

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
    entity?.set(Movement, {
      x: Math.max(-1, Math.min(1, input.x)),
      z: Math.max(-1, Math.min(1, input.z)),
    });
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
