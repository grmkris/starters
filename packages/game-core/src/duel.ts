import { createWorld, trait } from "koota";
import type { Entity } from "koota";

import { Player, Position } from "./traits";

/**
 * A duel: two lanes, one seam, bullets that cross it.
 *
 * The field is one rectangle. x is the seam axis, so side -1 owns x < 0 and
 * side 1 owns x > 0; z runs along each lane, which is what a portrait phone
 * shows tall. Each phone renders its own half, so a shot that crosses x = 0
 * leaves one screen and arrives on the other with nothing special happening
 * on the wire: it was always one world.
 *
 * Deterministic by construction. No clock, no randomness, players processed
 * in side order and projectiles in the order they were fired, so the ledger
 * replays a match exactly.
 */

/** x from -FIELD_HALF_WIDTH to FIELD_HALF_WIDTH; two lanes of four. */
export const FIELD_HALF_WIDTH = 4;
/** z from -LANE_HALF_HEIGHT to LANE_HALF_HEIGHT, a 9:19.5 phone's aspect. */
export const LANE_HALF_HEIGHT = 4.35;
/** Where a duelist sits across the seam. Movement is along the lane only. */
export const PLAYER_X = 3;
export const PLAYER_RADIUS = 0.4;
/** Lane speed toward the requested target, in units per second. */
export const PLAYER_SPEED = 6;
/** Crosses both lanes, 2 * FIELD_HALF_WIDTH, in 1.2 seconds. */
export const PROJECTILE_SPEED = (2 * FIELD_HALF_WIDTH) / 1.2;
const PROJECTILE_RADIUS = 0.12;
export const FIRE_COOLDOWN_SECONDS = 0.4;
/** Widest shot from straight across, so a lane cannot be fired down its length. */
export const MAX_FIRE_ANGLE = Math.PI / 3;
export const HITS_TO_KILL = 3;
export const ROUNDS_TO_WIN = 2;
export const COUNTDOWN_SECONDS = 3;
export const ROUND_OVER_SECONDS = 2;

/**
 * Sixty ticks of 0.05 do not sum to exactly 3 in float64. A timer that only
 * ended on exactly zero would end one tick late, and a replay would still agree
 * with it, so this is about honesty of the numbers rather than determinism.
 */
const TIMER_EPSILON = 1e-9;

const LANE_LIMIT = LANE_HALF_HEIGHT - PLAYER_RADIUS;
const WALL = LANE_HALF_HEIGHT - PROJECTILE_RADIUS;
const HIT_RADIUS = PLAYER_RADIUS + PROJECTILE_RADIUS;

export type Side = -1 | 1;

export type DuelPhase =
  | "waiting"
  | "countdown"
  | "playing"
  | "roundOver"
  | "matchOver";

const Duelist = trait({
  cooldown: 0,
  health: HITS_TO_KILL,
  rematch: false,
  rounds: 0,
  side: 1,
  target: 0,
});

const Projectile = trait({ bounces: 0, id: 0, vx: 0, vz: 0 });

interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface DuelPlayerState<Id extends string = string> {
  readonly clientId: Id;
  readonly cooldown: number;
  readonly health: number;
  readonly position: Vec3;
  readonly rematch: boolean;
  readonly rounds: number;
  readonly side: Side;
}

export interface ProjectileState<Id extends string = string> {
  readonly id: number;
  readonly ownerId: Id;
  readonly position: Vec3;
  readonly velocity: { readonly x: number; readonly z: number };
}

export interface DuelSnapshot<Id extends string = string> {
  readonly phase: DuelPhase;
  readonly round: number;
  /** Seconds left in `countdown` or `roundOver`; zero elsewhere. */
  readonly countdown: number;
  /** Who took the round in `roundOver`, or the match in `matchOver`. */
  readonly winner: Side | null;
  readonly players: readonly DuelPlayerState<Id>[];
  readonly projectiles: readonly ProjectileState<Id>[];
}

export interface DuelSimulation<Id extends string = string> {
  /** Seats the player on the first free side, or null when both are taken. */
  readonly join: (clientId: Id) => Side | null;
  /** Voids the match: the other player waits for a new opponent. */
  readonly leave: (clientId: Id) => void;
  /** Where along the lane to head. Level-triggered; the latest wins. */
  readonly move: (clientId: Id, target: number) => void;
  /** Fires across the seam if the player may. Edge-triggered; never queued. */
  readonly fire: (clientId: Id, angle: number) => void;
  /** After a match, both must ask before another begins. */
  readonly rematch: (clientId: Id) => void;
  readonly step: (deltaSeconds: number) => void;
  readonly snapshot: () => DuelSnapshot<Id>;
  readonly dispose: () => void;
}

const clamp = (value: number, limit: number): number =>
  Math.max(-limit, Math.min(limit, value));

/** Whether the segment from `from` to `to` passes within `radius` of `centre`. */
const segmentHits = (
  from: Vec3,
  to: Vec3,
  centre: Vec3,
  radius: number
): boolean => {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const lengthSquared = dx * dx + dz * dz;
  const along =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((centre.x - from.x) * dx + (centre.z - from.z) * dz) /
              lengthSquared
          )
        );
  const nearestX = from.x + along * dx;
  const nearestZ = from.z + along * dz;
  return Math.hypot(centre.x - nearestX, centre.z - nearestZ) <= radius;
};

export const createDuelSimulation = <
  Id extends string = string,
>(): DuelSimulation<Id> => {
  const world = createWorld();
  const players = new Map<Id, Entity>();
  // The owner sits beside the entity rather than in a trait: trait storage
  // widens an `Id` to string, and the snapshot has to hand the caller's type
  // back, as the player map does for the other simulation.
  const projectiles = new Map<
    number,
    { readonly entity: Entity; readonly ownerId: Id }
  >();
  let nextProjectileId = 1;
  let phase: DuelPhase = "waiting";
  let round = 1;
  let countdown = 0;
  let winner: Side | null = null;

  /** Side order, so processing is the same whichever player joined first. */
  const seated = (): readonly (readonly [Id, Entity])[] =>
    [...players].toSorted(([, left], [, right]) => {
      const leftSide = left.get(Duelist)?.side ?? 0;
      const rightSide = right.get(Duelist)?.side ?? 0;
      return leftSide - rightSide;
    });

  const clearProjectiles = (): void => {
    for (const { entity } of projectiles.values()) {
      entity.destroy();
    }
    projectiles.clear();
  };

  const resetRound = (): void => {
    for (const [, entity] of players) {
      const duelist = entity.get(Duelist);
      if (duelist === undefined) {
        continue;
      }
      entity.set(Duelist, {
        ...duelist,
        cooldown: 0,
        health: HITS_TO_KILL,
        target: 0,
      });
      entity.set(Position, { x: duelist.side * PLAYER_X, y: 0.5, z: 0 });
    }
    clearProjectiles();
  };

  const startCountdown = (): void => {
    phase = "countdown";
    countdown = COUNTDOWN_SECONDS;
    winner = null;
    resetRound();
  };

  const resetMatch = (): void => {
    round = 1;
    for (const [, entity] of players) {
      const duelist = entity.get(Duelist);
      if (duelist !== undefined) {
        entity.set(Duelist, { ...duelist, rematch: false, rounds: 0 });
      }
    }
  };

  const join = (clientId: Id): Side | null => {
    const existing = players.get(clientId)?.get(Duelist);
    if (existing !== undefined) {
      return existing.side === 1 ? 1 : -1;
    }
    if (players.size >= 2) {
      return null;
    }
    const taken = new Set(
      [...players.values()].map((entity) => entity.get(Duelist)?.side)
    );
    const side: Side = taken.has(-1) ? 1 : -1;
    const entity = world.spawn(
      Player({ clientId }),
      Position({ x: side * PLAYER_X, y: 0.5, z: 0 }),
      Duelist({ side })
    );
    players.set(clientId, entity);
    if (players.size === 2 && phase === "waiting") {
      startCountdown();
    }
    return side;
  };

  const leave = (clientId: Id): void => {
    const entity = players.get(clientId);
    if (entity === undefined) {
      return;
    }
    entity.destroy();
    players.delete(clientId);
    // The match is void, not paused. There is no policy here for how long a
    // lone player keeps a lead, so there is no lead to keep.
    phase = "waiting";
    countdown = 0;
    winner = null;
    resetMatch();
    resetRound();
  };

  const move = (clientId: Id, target: number): void => {
    const entity = players.get(clientId);
    const duelist = entity?.get(Duelist);
    if (entity === undefined || duelist === undefined) {
      return;
    }
    entity.set(Duelist, { ...duelist, target: clamp(target, LANE_LIMIT) });
  };

  const fire = (clientId: Id, angle: number): void => {
    if (phase !== "playing") {
      return;
    }
    const entity = players.get(clientId);
    const duelist = entity?.get(Duelist);
    const position = entity?.get(Position);
    if (
      entity === undefined ||
      duelist === undefined ||
      position === undefined ||
      duelist.cooldown > 0
    ) {
      return;
    }
    const aim = clamp(angle, MAX_FIRE_ANGLE);
    // Straight across is toward the seam, whichever side is firing.
    const vx = -duelist.side * Math.cos(aim) * PROJECTILE_SPEED;
    const vz = Math.sin(aim) * PROJECTILE_SPEED;
    const id = nextProjectileId;
    nextProjectileId += 1;
    const projectile = world.spawn(
      Projectile({ id, vx, vz }),
      Position({
        x: position.x - duelist.side * (PLAYER_RADIUS + PROJECTILE_RADIUS),
        y: 0.5,
        z: position.z,
      })
    );
    projectiles.set(id, { entity: projectile, ownerId: clientId });
    entity.set(Duelist, { ...duelist, cooldown: FIRE_COOLDOWN_SECONDS });
  };

  const rematch = (clientId: Id): void => {
    if (phase !== "matchOver") {
      return;
    }
    const entity = players.get(clientId);
    const duelist = entity?.get(Duelist);
    if (entity === undefined || duelist === undefined) {
      return;
    }
    entity.set(Duelist, { ...duelist, rematch: true });
    const everyone = [...players.values()].every(
      (candidate) => candidate.get(Duelist)?.rematch === true
    );
    if (players.size === 2 && everyone) {
      resetMatch();
      startCountdown();
    }
  };

  const roundWon = (bySide: Side): void => {
    phase = "roundOver";
    winner = bySide;
    countdown = ROUND_OVER_SECONDS;
    for (const [, entity] of players) {
      const duelist = entity.get(Duelist);
      if (duelist !== undefined && duelist.side === bySide) {
        entity.set(Duelist, { ...duelist, rounds: duelist.rounds + 1 });
      }
    }
    clearProjectiles();
  };

  const advancePlayers = (deltaSeconds: number): void => {
    for (const [, entity] of seated()) {
      const duelist = entity.get(Duelist);
      const position = entity.get(Position);
      if (duelist === undefined || position === undefined) {
        continue;
      }
      const stride = clamp(
        position.z - duelist.target,
        PLAYER_SPEED * deltaSeconds
      );
      entity.set(Position, { ...position, z: position.z - stride });
      const remaining = duelist.cooldown - deltaSeconds;
      entity.set(Duelist, {
        ...duelist,
        cooldown: remaining <= TIMER_EPSILON ? 0 : remaining,
      });
    }
  };

  /** Returns the side that scored a kill this step, if any. */
  const advanceProjectiles = (deltaSeconds: number): Side | null => {
    for (const [id, { entity, ownerId }] of projectiles) {
      const projectile = entity.get(Projectile);
      const from = entity.get(Position);
      if (projectile === undefined || from === undefined) {
        continue;
      }
      let { vz, bounces } = projectile;
      let z = from.z + vz * deltaSeconds;
      const x = from.x + projectile.vx * deltaSeconds;

      if (Math.abs(z) > WALL) {
        // One bank shot is a feature; a second wall is the end of the flight.
        if (bounces >= 1) {
          entity.destroy();
          projectiles.delete(id);
          continue;
        }
        z = Math.sign(z) * (2 * WALL) - z;
        vz = -vz;
        bounces += 1;
      }

      if (Math.abs(x) > FIELD_HALF_WIDTH + PROJECTILE_RADIUS) {
        entity.destroy();
        projectiles.delete(id);
        continue;
      }

      const to = { x, y: from.y, z };
      entity.set(Position, to);
      entity.set(Projectile, { ...projectile, bounces, vz });

      for (const [clientId, target] of seated()) {
        const duelist = target.get(Duelist);
        const centre = target.get(Position);
        if (
          duelist === undefined ||
          centre === undefined ||
          clientId === ownerId ||
          !segmentHits(from, to, centre, HIT_RADIUS)
        ) {
          continue;
        }
        entity.destroy();
        projectiles.delete(id);
        const health = duelist.health - 1;
        target.set(Duelist, { ...duelist, health });
        if (health <= 0) {
          return duelist.side === 1 ? -1 : 1;
        }
        break;
      }
    }
    return null;
  };

  const step = (deltaSeconds: number): void => {
    switch (phase) {
      case "waiting":
      case "matchOver": {
        return;
      }
      case "countdown": {
        countdown = Math.max(0, countdown - deltaSeconds);
        if (countdown <= TIMER_EPSILON) {
          countdown = 0;
          phase = "playing";
        }
        return;
      }
      case "playing": {
        advancePlayers(deltaSeconds);
        const scorer = advanceProjectiles(deltaSeconds);
        if (scorer !== null) {
          roundWon(scorer);
        }
        return;
      }
      case "roundOver": {
        countdown = Math.max(0, countdown - deltaSeconds);
        if (countdown > TIMER_EPSILON) {
          return;
        }
        countdown = 0;
        const decided = [...players.values()].some(
          (entity) => (entity.get(Duelist)?.rounds ?? 0) >= ROUNDS_TO_WIN
        );
        if (decided) {
          phase = "matchOver";
          return;
        }
        round += 1;
        startCountdown();
      }
    }
  };

  const snapshot = (): DuelSnapshot<Id> => {
    const playerStates: DuelPlayerState<Id>[] = [];
    for (const [clientId, entity] of seated()) {
      const duelist = entity.get(Duelist);
      const position = entity.get(Position);
      if (duelist === undefined || position === undefined) {
        continue;
      }
      playerStates.push({
        clientId,
        cooldown: duelist.cooldown,
        health: duelist.health,
        position: { x: position.x, y: position.y, z: position.z },
        rematch: duelist.rematch,
        rounds: duelist.rounds,
        side: duelist.side === 1 ? 1 : -1,
      });
    }

    const projectileStates: ProjectileState<Id>[] = [];
    for (const { entity, ownerId } of projectiles.values()) {
      const projectile = entity.get(Projectile);
      const position = entity.get(Position);
      if (projectile === undefined || position === undefined) {
        continue;
      }
      projectileStates.push({
        id: projectile.id,
        ownerId,
        position: { x: position.x, y: position.y, z: position.z },
        velocity: { x: projectile.vx, z: projectile.vz },
      });
    }

    return {
      countdown,
      phase,
      players: playerStates,
      projectiles: projectileStates,
      round,
      winner,
    };
  };

  const dispose = (): void => {
    players.clear();
    projectiles.clear();
    world.destroy();
  };

  return { dispose, fire, join, leave, move, rematch, snapshot, step };
};
