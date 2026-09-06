import type { DuelLayout } from "@agent-native/game-three";

/**
 * What a thumb and a keyboard share: how the screen maps onto the lane, and
 * how a lane target reaches the server.
 *
 * The lane runs down the screen in portrait and across it in landscape, and
 * the seam is on the right or left in portrait and below or above in
 * landscape, so the mapping from screen directions to lane units and to
 * "toward the seam" depends on the layout and the side.
 */

/** Screen movement along the lane, in the direction of +z. */
export const alongLane = (
  layout: DuelLayout,
  dx: number,
  dy: number
): number =>
  // Screen-down is +z in portrait; screen-right is -z in landscape.
  layout === "portrait" ? dy : -dx;

/** Screen movement toward the seam, positive when heading for it. */
export const towardSeam = (
  layout: DuelLayout,
  side: -1 | 1,
  dx: number,
  dy: number
): number => {
  if (layout === "portrait") {
    return side === -1 ? dx : -dx;
  }
  // Stacked: side -1 is the upper phone with the seam below it.
  return side === -1 ? dy : -dy;
};

/** The simulation consumes one target per tick, so sending faster is waste. */
const SEND_INTERVAL_MS = 50;

const quantise = (value: number): number => Math.round(value * 20) / 20;

export interface MoveSender {
  /**
   * Sends the target unless one went out this tick or it has not changed.
   * `force` sends regardless: a gesture's last word must not be throttled
   * away, or the player stops short of where the finger let go.
   */
  readonly send: (target: number, force: boolean) => void;
}

export const createMoveSender = (
  deliver: (target: number) => void,
  now: () => number = () => performance.now()
): MoveSender => {
  let lastSentAt = Number.NEGATIVE_INFINITY;
  let lastTarget = Number.NaN;

  return {
    send: (target, force) => {
      const at = now();
      const value = quantise(target);
      if (
        !force &&
        (at - lastSentAt < SEND_INTERVAL_MS || value === lastTarget)
      ) {
        return;
      }
      lastSentAt = at;
      lastTarget = value;
      deliver(value);
    },
  };
};
