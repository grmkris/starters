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

/** What the duel renderer reads: the world source plus the shots in flight. */
export interface DuelSource extends WorldSource {
  readonly getProjectiles: () => readonly DuelProjectile[];
}
