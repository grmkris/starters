/**
 * How one lane sits on one screen.
 *
 * Two things have to hold at once: the seam sits on the screen's edge, so two
 * phones pushed together share it, and the whole lane is on screen, so a
 * player at the wall is not half off it. The lane is fitted by whichever of
 * its two axes the screen is tighter on, and the camera is centred on what
 * the screen shows across the lane rather than on the lane itself, so the
 * slack a wide window leaves goes behind the back wall, never beyond the
 * seam. On a phone the fits differ by a few percent; on a laptop window,
 * wider than the lane is long, the difference is the last half unit of lane
 * at each end.
 */

export interface ScreenExtent {
  /** Pixels across the lane, from the seam to the back wall. */
  readonly across: number;
  /** Pixels along the lane, wall to wall. */
  readonly along: number;
}

export interface LaneExtent {
  /** Units from the seam to the back wall. */
  readonly width: number;
  /** Units wall to wall. */
  readonly length: number;
}

export interface LaneFit {
  /** Pixels per unit. */
  readonly zoom: number;
  /** Where the camera looks, along x, so the seam (x = 0) is on the edge. */
  readonly cameraX: number;
}

export const fitLane = (
  screen: ScreenExtent,
  lane: LaneExtent,
  side: -1 | 1
): LaneFit => {
  const zoom = Math.min(screen.across / lane.width, screen.along / lane.length);
  if (!Number.isFinite(zoom) || zoom <= 0) {
    // A canvas that has no size yet. Anything finite; the next size fixes it.
    return { cameraX: (side * lane.width) / 2, zoom: 1 };
  }
  return { cameraX: (side * (screen.across / zoom)) / 2, zoom };
};
