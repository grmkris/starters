import { useEffect } from "react";

import { createMoveSender } from "../lib/lane-control";
import { createLaneKeys } from "../lib/lane-keys";
import type { LaneKeysOptions } from "../lib/lane-keys";
import { realtimeStore } from "../lib/realtime-store";

export interface UseLaneKeysOptions extends LaneKeysOptions {
  readonly enabled: boolean;
}

/**
 * Puts the keyboard on the lane. The mapping lives in `lane-keys`; this is
 * the part that needs a window: listening, keeping Space and the arrows from
 * scrolling, and running one animation frame at a time while a key is held so
 * the target moves with the clock.
 */
export const useLaneKeys = (options: UseLaneKeysOptions): void => {
  const {
    currentZ,
    enabled,
    laneHalfHeight,
    layout,
    maxFireAngle,
    playerSpeed,
  } = options;

  useEffect(() => {
    if (!enabled) {
      return () => {
        // Nothing was attached, so there is nothing to detach.
      };
    }

    const keys = createLaneKeys({
      currentZ,
      laneHalfHeight,
      layout,
      maxFireAngle,
      playerSpeed,
    });
    const sender = createMoveSender((target) => {
      realtimeStore.duelMove(target);
    });
    let frame = 0;
    let lastAt = 0;

    const loop = (at: number): void => {
      const target = keys.tick(lastAt === 0 ? 0 : (at - lastAt) / 1000);
      lastAt = at;
      if (target === null) {
        frame = 0;
        lastAt = 0;
        return;
      }
      sender.send(target, false);
      frame = requestAnimationFrame(loop);
    };

    // The last word once every key is up: a throttled target must not leave
    // the player short of where the key let go.
    const settle = (): void => {
      const target = keys.target();
      if (!keys.moving() && target !== null) {
        sender.send(target, true);
      }
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      // Modifiers mean a browser shortcut, never a move.
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const { fire, handled } = keys.press(event.code);
      if (!handled) {
        return;
      }
      event.preventDefault();
      if (fire !== null) {
        realtimeStore.duelFire(fire);
        return;
      }
      if (frame === 0) {
        lastAt = 0;
        frame = requestAnimationFrame(loop);
      }
    };

    const onKeyUp = (event: KeyboardEvent): void => {
      keys.release(event.code);
      settle();
    };

    // A backgrounded tab never receives keyup, so a held key would otherwise
    // drive the player into the wall and keep it there.
    const releaseAll = (): void => {
      keys.releaseAll();
      settle();
    };
    const onVisibilityChange = (): void => {
      if (document.hidden) {
        releaseAll();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseAll);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", releaseAll);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      cancelAnimationFrame(frame);
      keys.releaseAll();
    };
  }, [currentZ, enabled, laneHalfHeight, layout, maxFireAngle, playerSpeed]);
};
