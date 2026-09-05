import { useEffect } from "react";
import type { RefObject } from "react";

import { realtimeStore } from "../lib/realtime-store";

/**
 * One thumb, three gestures, on the whole play surface.
 *
 * Hold and drag slides the player along the lane, relative to where the drag
 * began, so the thumb can rest anywhere. A quick tap fires straight across the
 * seam. A quick swipe toward the seam fires along the swipe's angle. The
 * thresholds separate "I moved a little while tapping" from "I meant to
 * drag", and "a flick" from "a slow drag that happened to be short".
 */

export interface LaneInputOptions {
  /** Which way the seam is: screen-right for side -1, screen-left for side 1. */
  readonly side: -1 | 1 | null;
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

const quantise = (value: number): number => Math.round(value * 20) / 20;

export const useLaneInput = (
  surface: RefObject<HTMLElement | null>,
  options: LaneInputOptions
): void => {
  const { currentZ, enabled, laneHalfHeight, maxFireAngle, side } = options;

  useEffect(() => {
    const element = surface.current;
    if (!element || !enabled || side === null) {
      return () => {
        // Nothing was attached, so there is nothing to detach.
      };
    }

    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let startAt = 0;
    let startZ = 0;
    let dragging = false;
    let lastSentAt = 0;
    let lastTarget = Number.NaN;

    const unitsPerPixel = (): number =>
      (2 * laneHalfHeight) / Math.max(1, element.clientHeight);

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
      if (pointerId !== null) {
        return;
      }
      element.setPointerCapture(event.pointerId);
      const { clientX, clientY, pointerId: pressed } = event;
      pointerId = pressed;
      startX = clientX;
      startY = clientY;
      startAt = performance.now();
      startZ = currentZ();
      dragging = false;
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) {
        return;
      }
      const dy = event.clientY - startY;
      if (!dragging && Math.abs(dy) < TAP_SLOP_PX) {
        return;
      }
      dragging = true;
      sendTarget(startZ + dy * unitsPerPixel(), false);
    };

    const onRelease = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) {
        return;
      }
      pointerId = null;
      const elapsed = performance.now() - startAt;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      const towardSeam = side === -1 ? dx : -dx;
      const distance = Math.hypot(dx, dy);

      if (elapsed < FLICK_MS && distance < TAP_SLOP_PX) {
        realtimeStore.duelFire(0);
        return;
      }
      if (elapsed < FLICK_MS && towardSeam > FLICK_PX) {
        // Screen-down is +z on both phones, so the angle's sign carries over.
        const angle = Math.atan2(dy, towardSeam);
        realtimeStore.duelFire(
          Math.max(-maxFireAngle, Math.min(maxFireAngle, angle))
        );
        return;
      }
      if (dragging) {
        // Forced: a throttled last move must not leave the player short.
        sendTarget(startZ + dy * unitsPerPixel(), true);
      }
    };

    const onCancel = (event: PointerEvent): void => {
      if (event.pointerId === pointerId) {
        pointerId = null;
      }
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
  }, [currentZ, enabled, laneHalfHeight, maxFireAngle, side, surface]);
};
