/**
 * The shot, as drawn. Long along its own x, which the instanced mesh turns to
 * follow the velocity. Unlit and not tone-mapped, so it reads as a light
 * rather than a lit object, in the owner's colour through the instance colour.
 */

export const STREAK_LENGTH = 0.55;
export const STREAK_THICKNESS = 0.09;

export const StreakGeometry = () => (
  <boxGeometry args={[STREAK_LENGTH, STREAK_THICKNESS, STREAK_THICKNESS]} />
);

export const StreakMaterial = () => <meshBasicMaterial toneMapped={false} />;
