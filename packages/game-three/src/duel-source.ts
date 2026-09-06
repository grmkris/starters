import type { WorldSource } from "./world-source";

export interface DuelProjectile {
  readonly id: number;
  readonly ownerId: string;
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly velocity: { readonly x: number; readonly z: number };
}

interface Spot {
  readonly x: number;
  readonly z: number;
}

/**
 * The moments of a duel, derived once from consecutive snapshots by whoever
 * owns the feed and consumed by the renderer, the sound and the vibration
 * alike. A snapshot says what is; an event says what just happened.
 */
export type DuelEvent =
  | {
      readonly kind: "fire";
      readonly id: number;
      readonly ownerId: string;
      readonly at: Spot;
    }
  | { readonly kind: "bounce"; readonly id: number; readonly at: Spot }
  | {
      readonly kind: "cross";
      readonly id: number;
      readonly ownerId: string;
      readonly at: Spot;
    }
  | {
      readonly kind: "hit";
      readonly clientId: string;
      readonly by: string;
      readonly at: Spot;
    }
  | { readonly kind: "round"; readonly winner: -1 | 1 | null }
  | { readonly kind: "match"; readonly winner: -1 | 1 | null };

export interface Duelist {
  readonly side: -1 | 1;
  readonly health: number;
}

/** What the duel renderer reads: the world source, the shots, and the moments. */
export interface DuelSource extends WorldSource {
  readonly getProjectiles: () => readonly DuelProjectile[];
  readonly getDuelist: (clientId: string) => Duelist | undefined;
  readonly subscribeEvents: (
    listener: (event: DuelEvent) => void
  ) => () => void;
}
