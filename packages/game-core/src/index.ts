import { createWorld, trait } from "koota";
import type { Entity, World } from "koota";

const MAX_SPEED = 3.5;

export const Player = trait({ clientId: "" });
export const Position = trait({ x: 0, y: 0.5, z: 0 });
export const Movement = trait({ x: 0, z: 0 });

export interface PlayerState {
  readonly clientId: string;
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
}

export interface Simulation {
  readonly world: World;
  readonly spawnPlayer: (clientId: string) => void;
  readonly removePlayer: (clientId: string) => void;
  readonly applyInput: (
    clientId: string,
    input: { readonly x: number; readonly z: number }
  ) => void;
  readonly step: (deltaSeconds: number) => void;
  readonly snapshot: () => readonly PlayerState[];
}

export const createSimulation = (): Simulation => {
  const world = createWorld();
  const players = new Map<string, Entity>();

  const spawnPlayer = (clientId: string): void => {
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

  const removePlayer = (clientId: string): void => {
    const entity = players.get(clientId);
    if (!entity) {
      return;
    }

    entity.destroy();
    players.delete(clientId);
  };

  const applyInput = (
    clientId: string,
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

  const snapshot = (): readonly PlayerState[] => {
    const state: PlayerState[] = [];
    world.query(Player, Position).readEach(([player, position]) => {
      state.push({
        clientId: player.clientId,
        position: { x: position.x, y: position.y, z: position.z },
      });
    });
    return state;
  };

  return { applyInput, removePlayer, snapshot, spawnPlayer, step, world };
};
