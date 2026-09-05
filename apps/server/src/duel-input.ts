/**
 * Collects duel intent between ticks, as `input-buffer.ts` does for movement.
 *
 * A lane target is level-triggered, so the latest in a window wins. A shot is
 * edge-triggered and the rules refuse a second inside the cooldown anyway, so
 * the first in a window is the one that counts and a later one is dropped
 * rather than queued into the next tick, where it would fire later than the
 * player meant. A rematch is a flag: asked or not.
 */

interface CapturedDuelIntent<Id extends string> {
  readonly clientId: Id;
  readonly fire: number | null;
  readonly move: number | null;
  readonly rematch: boolean;
}

export interface DuelInputBuffer<Id extends string> {
  readonly move: (clientId: Id, target: number) => void;
  readonly fire: (clientId: Id, angle: number) => void;
  readonly rematch: (clientId: Id) => void;
  /** Returns the frame to apply at this tick boundary and empties the buffer. */
  readonly drain: () => readonly CapturedDuelIntent<Id>[];
}

interface Pending {
  fire: number | null;
  move: number | null;
  rematch: boolean;
}

export const createDuelInputBuffer = <
  Id extends string,
>(): DuelInputBuffer<Id> => {
  const pending = new Map<Id, Pending>();

  const entry = (clientId: Id): Pending => {
    const existing = pending.get(clientId);
    if (existing !== undefined) {
      return existing;
    }
    const fresh: Pending = { fire: null, move: null, rematch: false };
    pending.set(clientId, fresh);
    return fresh;
  };

  return {
    move: (clientId, target) => {
      entry(clientId).move = target;
    },
    fire: (clientId, angle) => {
      const current = entry(clientId);
      current.fire ??= angle;
    },
    rematch: (clientId) => {
      entry(clientId).rematch = true;
    },
    drain: () => {
      // Sorted so a frame is a canonical record, as the movement buffer's is.
      const frame = [...pending]
        .map(([clientId, intent]) => ({ clientId, ...intent }))
        .toSorted((left, right) => (left.clientId < right.clientId ? -1 : 1));
      pending.clear();
      return frame;
    },
  };
};
