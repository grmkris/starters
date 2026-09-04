import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import { realtimeStore } from "../lib/realtime-store";

/** Travel limit of the thumb from the pad centre, in pixels. */
const RADIUS = 56;

/**
 * Reciprocal of the step sent values snap to.
 *
 * `sendInput` drops a repeat only when both axes are identical, so a raw
 * pointer stream - which can be one event per frame - would defeat that check
 * on every move and put a message on the socket per frame. Rounding to a tenth
 * makes a held stick settle on one value that the store then dedupes.
 */
const STEPS_PER_UNIT = 10;

/** The simulation consumes one input frame per tick, so sending faster is waste. */
const SEND_INTERVAL_MS = 50;

const quantise = (value: number): number =>
  Math.round(value * STEPS_PER_UNIT) / STEPS_PER_UNIT;

/**
 * Touch movement control.
 *
 * The keyboard path emits only -1, 0 and 1 per axis, but `MovementInput` is
 * `Schema.Finite` and `game-core` clamps to the unit range, so an analogue
 * vector needs no protocol change and the clamp that already existed does the
 * rest.
 *
 * Pointer events rather than touch events: `setPointerCapture` keeps a drag
 * tracking after the finger leaves the pad, which a touch-event implementation
 * has to reproduce by hand.
 */
export const Thumbstick = () => {
  const pad = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const activePointer = useRef<number | null>(null);
  const lastSentAt = useRef(0);

  const publish = (x: number, z: number, force: boolean): void => {
    const now = performance.now();
    if (!force && now - lastSentAt.current < SEND_INTERVAL_MS) {
      // Dropped rather than queued. A finger held still after a dropped move
      // leaves the server up to one step behind until the next move or the
      // release below, which is under a tenth of full speed for one tick.
      return;
    }
    lastSentAt.current = now;
    realtimeStore.sendInput({ x: quantise(x), z: quantise(z) });
  };

  const track = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const element = pad.current;
    if (!element) {
      return;
    }

    const bounds = element.getBoundingClientRect();
    const dx = event.clientX - (bounds.left + bounds.width / 2);
    const dy = event.clientY - (bounds.top + bounds.height / 2);
    const distance = Math.hypot(dx, dy);
    const scale = distance > RADIUS ? RADIUS / distance : 1;
    const offsetX = dx * scale;
    const offsetY = dy * scale;

    if (thumb.current) {
      thumb.current.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    }

    // Screen-down is +z, which is what the S key already sends.
    publish(offsetX / RADIUS, offsetY / RADIUS, false);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointer.current = event.pointerId;
    track(event);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (activePointer.current === event.pointerId) {
      track(event);
    }
  };

  const onRelease = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (activePointer.current !== event.pointerId) {
      return;
    }
    activePointer.current = null;
    if (thumb.current) {
      thumb.current.style.transform = "translate(0px, 0px)";
    }
    // Forced: a throttled final move must not leave the avatar walking.
    publish(0, 0, true);
  };

  return (
    <div
      aria-label="Movement control"
      className="border-border/70 bg-background/50 pointer-events-auto hidden size-32 touch-none place-items-center rounded-full border backdrop-blur-sm pointer-coarse:grid"
      data-testid="thumbstick"
      onPointerCancel={onRelease}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onRelease}
      ref={pad}
      role="application"
    >
      <div
        className="bg-primary/70 ring-primary/30 size-12 rounded-full ring-4"
        ref={thumb}
      />
    </div>
  );
};
