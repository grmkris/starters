import type { DuelLayout } from "@agent-native/game-three";

import { alongLane } from "./lane-control";

/**
 * Keys, for a laptop across the table from a phone.
 *
 * Physical codes, as in the lobby: the cluster under the fingers is the same
 * on AZERTY and Dvorak. The arrow pair that runs along the lane on screen
 * moves, and WASD doubles it: up and down when the lane runs down the screen,
 * left and right when it runs across. A held key heads for the wall at the
 * speed the rules allow, so the target never runs ahead of the player and
 * letting go stops where the player is rather than snapping back. Space or
 * Enter fires straight. Q and E fire a banked shot toward the start or the
 * end of the lane on screen.
 *
 * Nothing here touches the DOM or the clock, so it can be tested as a value.
 */

type LaneDirection = -1 | 1;

export interface LaneKeysOptions {
  readonly layout: DuelLayout;
  readonly laneHalfHeight: number;
  readonly maxFireAngle: number;
  /** Units per second the rules move a player, so a held key matches it. */
  readonly playerSpeed: number;
  /** Where the player is now, so a move starts from it. */
  readonly currentZ: () => number;
}

interface KeyPress {
  /** Whether the key means something here, so the page can keep it from scrolling. */
  readonly handled: boolean;
  /** An angle to fire at, when the key was a shot. */
  readonly fire: number | null;
}

export interface LaneKeys {
  readonly press: (code: string) => KeyPress;
  readonly release: (code: string) => void;
  readonly releaseAll: () => void;
  /** Whether a move key is held. */
  readonly moving: () => boolean;
  /** Moves the target on by the time elapsed and returns it; null when nothing is held. */
  readonly tick: (deltaSeconds: number) => number | null;
  /** The last target, or null when no move key has been pressed yet. */
  readonly target: () => number | null;
}

/**
 * A banked shot's angle. Well inside the widest the rules allow, so it banks
 * once off the wall and comes back into the lane rather than skimming it.
 */
const BANK_ANGLE = Math.PI / 4;

const FIRE_CODES: ReadonlySet<string> = new Set(["Enter", "Space"]);

/** The keys that head for the start of the lane on screen: its top, or its left. */
const START_CODES: Record<DuelLayout, ReadonlySet<string>> = {
  landscape: new Set(["ArrowLeft", "KeyA"]),
  portrait: new Set(["ArrowUp", "KeyW"]),
};

const END_CODES: Record<DuelLayout, ReadonlySet<string>> = {
  landscape: new Set(["ArrowRight", "KeyD"]),
  portrait: new Set(["ArrowDown", "KeyS"]),
};

/**
 * Which way along the lane the start of the screen lies, through the same
 * mapping a thumb's movement takes: up in portrait, left in landscape.
 */
const towardScreenStart = (layout: DuelLayout): LaneDirection => {
  const along =
    layout === "portrait" ? alongLane(layout, 0, -1) : alongLane(layout, -1, 0);
  return along < 0 ? -1 : 1;
};

const opposite = (direction: LaneDirection): LaneDirection =>
  direction === 1 ? -1 : 1;

const moveDirection = (
  layout: DuelLayout,
  code: string
): LaneDirection | null => {
  const start = towardScreenStart(layout);
  if (START_CODES[layout].has(code)) {
    return start;
  }
  if (END_CODES[layout].has(code)) {
    return opposite(start);
  }
  return null;
};

const fireAngle = (
  layout: DuelLayout,
  code: string,
  bank: number
): number | null => {
  if (FIRE_CODES.has(code)) {
    return 0;
  }
  if (code === "KeyQ") {
    return towardScreenStart(layout) * bank;
  }
  if (code === "KeyE") {
    return opposite(towardScreenStart(layout)) * bank;
  }
  return null;
};

const clamp = (value: number, limit: number): number =>
  Math.max(-limit, Math.min(limit, value));

interface HeldKey {
  readonly code: string;
  readonly direction: LaneDirection;
}

export const createLaneKeys = (options: LaneKeysOptions): LaneKeys => {
  const { currentZ, laneHalfHeight, layout, maxFireAngle, playerSpeed } =
    options;
  const bank = Math.min(BANK_ANGLE, maxFireAngle);
  /** Held move keys in the order pressed; the latest decides the direction. */
  const held: HeldKey[] = [];
  let target: number | null = null;

  const direction = (): LaneDirection | null => held.at(-1)?.direction ?? null;

  const press = (code: string): KeyPress => {
    const fire = fireAngle(layout, code, bank);
    if (fire !== null) {
      return { fire, handled: true };
    }
    const wanted = moveDirection(layout, code);
    if (wanted === null) {
      return { fire: null, handled: false };
    }
    // A key held down reports itself again; that is not a new move.
    if (!held.some((key) => key.code === code)) {
      if (held.length === 0) {
        // A fresh move starts from the player, not from where an old one ended.
        target = currentZ();
      }
      held.push({ code, direction: wanted });
    }
    return { fire: null, handled: true };
  };

  const release = (code: string): void => {
    const index = held.findIndex((key) => key.code === code);
    if (index !== -1) {
      held.splice(index, 1);
    }
  };

  const releaseAll = (): void => {
    held.splice(0);
  };

  const tick = (deltaSeconds: number): number | null => {
    const heading = direction();
    if (heading === null || target === null) {
      return null;
    }
    target = clamp(
      target + heading * playerSpeed * deltaSeconds,
      laneHalfHeight
    );
    return target;
  };

  return {
    moving: () => held.length > 0,
    press,
    release,
    releaseAll,
    target: () => target,
    tick,
  };
};
