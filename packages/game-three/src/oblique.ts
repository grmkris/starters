import { Matrix4 } from "three";

/**
 * Depth without moving the ground.
 *
 * The lane is drawn straight down, orthographic, so the seam sits exactly on
 * the screen's edge. A tilted camera would push anything above the ground
 * past the lane's true edge. This shear keeps every ground point where it
 * is and slides height up the screen instead: `z' = z - k * y`, and screen-up
 * is -z on both phones. A box shows its top offset from its base, so its
 * near face appears, which is all the depth a top-down lane needs.
 *
 * Applied to a group around the lane's contents rather than to the camera,
 * so nothing has to be re-applied when the camera recomputes itself.
 */
export const obliqueShear = (k: number): Matrix4 =>
  // Row-major: the third row reads `z' = -k * y + z`.
  new Matrix4().set(1, 0, 0, 0, 0, 1, 0, 0, 0, -k, 1, 0, 0, 0, 0, 1);
