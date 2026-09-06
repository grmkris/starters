import type { DuelLayout } from "@agent-native/game-three";
import { useEffect } from "react";
import type { RefObject } from "react";

import { realtimeStore } from "../lib/realtime-store";

/**
 * Thumbs, on the whole play surface.
 *
 * Every finger is its own gesture. Hold and drag slides the player along the
 * lane, relative to where that finger landed, so a thumb can rest anywhere
 * and keep sliding while another finger taps to shoot. A quick tap fires
 * straight across the seam. A quick flick toward the seam fires along the
 * flick's angle. The thresholds separate "I moved a little while tapping"
 * from "I meant to drag", and "a flick" from "a slow drag that was short".
 *
 * The lane runs down the screen in portrait and across it in landscape, and
 * the seam is on the right or left in portrait and below or above in
 * landscape, so the mapping from screen deltas to lane units and to "toward
 * the seam" depends on the layout and the side.
 */

export interface LaneInputOptions {
  readonly side: -1 | 1 | null;
  readonly layout: DuelLayout;
  readonly laneHalfHeight: number;
  readonly maxFireAngle: number;
  readonly enabled: boolean;
  /** Where the player is now, so a drag is relative to it. */
  readonly currentZ: () => number;
}

/** Movement before a touch stops being a tap, in CSS pixels. */
const TAP_SLOP_PX = 8;
/** A gesture shorter than this is a tap or a flick, never a drag. */
const FLICK_MS = 260;
/** A flick has to travel this far toward the seam to count as a shot. */
const FLICK_PX = 24;
/** The simulation consumes one target per tick, so sending faster is waste. */
const SEND_INTERVAL_MS = 50;

interface Gesture {
  readonly startX: number;
  readonly startY: number;
  readonly startAt: number;
  readonly startZ: number;
  dragging: boolean;
}

const quantise = (value: number): number => Math.round(value * 20) / 20;

/** Screen movement along the lane, in the direction of +z. */
const alongLane = (layout: DuelLayout, dx: number, dy: number): number =>
  // Screen-down is +z in portrait; screen-right is -z in landscape.
  layout === "portrait" ? dy : -dx;

/** Screen movement toward the seam, positive when heading for it. */
const towardSeam = (
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

export const useLaneInput = (
  surface: RefObject<HTMLElement | null>,
  options: LaneInputOptions
): void => {
  const { currentZ, enabled, laneHalfHeight, layout, maxFireAngle, side } =
    options;

  useEffect(() => {
    const element = surface.current;
    if (!element || !enabled || side === null) {
      return () => {
        // Nothing was attached, so there is nothing to detach.
      };
    }

    const gestures = new Map<number, Gesture>();
    let lastSentAt = 0;
    let lastTarget = Number.NaN;

    const unitsPerPixel = (): number => {
      const extent =
        layout === "portrait" ? element.clientHeight : element.clientWidth;
      return (2 * laneHalfHeight) / Math.max(1, extent);
    };

    const sendTarget = (target: number, force: boolean): void => {
      const now = performance.now();
      const value = quantise(target);
      if (
        !force &&
        (now - lastSentAt < SEND_INTERVAL_MS || value === lastTarget)
      ) {
        return;
      }
      lastSentAt = now;
      lastTarget = value;
      realtimeStore.duelMove(value);
    };

    const onPointerDown = (event: PointerEvent): void => {
      element.setPointerCapture(event.pointerId);
      const { clientX, clientY, pointerId } = event;
      gestures.set(pointerId, {
        dragging: false,
        startAt: performance.now(),
        startX: clientX,
        startY: clientY,
        startZ: currentZ(),
      });
    };

    const onPointerMove = (event: PointerEvent): void => {
      const gesture = gestures.get(event.pointerId);
      if (gesture === undefined) {
        return;
      }
      const along = alongLane(
        layout,
        event.clientX - gesture.startX,
        event.clientY - gesture.startY
      );
      if (!gesture.dragging && Math.abs(along) < TAP_SLOP_PX) {
        return;
      }
      gesture.dragging = true;
      sendTarget(gesture.startZ + along * unitsPerPixel(), false);
    };

    const onRelease = (event: PointerEvent): void => {
      const gesture = gestures.get(event.pointerId);
      if (gesture === undefined) {
        return;
      }
      gestures.delete(event.pointerId);
      const elapsed = performance.now() - gesture.startAt;
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      const along = alongLane(layout, dx, dy);
      const toward = towardSeam(layout, side, dx, dy);
      const distance = Math.hypot(dx, dy);

      if (elapsed < FLICK_MS && distance < TAP_SLOP_PX) {
        realtimeStore.duelFire(0);
        return;
      }
      if (elapsed < FLICK_MS && toward > FLICK_PX) {
        // +z is the positive angle on both phones in either layout.
        const angle = Math.atan2(along, toward);
        realtimeStore.duelFire(
          Math.max(-maxFireAngle, Math.min(maxFireAngle, angle))
        );
        return;
      }
      if (gesture.dragging) {
        // Forced: a throttled last move must not leave the player short.
        sendTarget(gesture.startZ + along * unitsPerPixel(), true);
      }
    };

    const onCancel = (event: PointerEvent): void => {
      gestures.delete(event.pointerId);
    };

    element.addEventListener("pointerdown", onPointerDown);
    element.addEventListener("pointermove", onPointerMove);
    element.addEventListener("pointerup", onRelease);
    element.addEventListener("pointercancel", onCancel);
    return () => {
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onRelease);
      element.removeEventListener("pointercancel", onCancel);
    };
  }, [currentZ, enabled, laneHalfHeight, layout, maxFireAngle, side, surface]);
};
