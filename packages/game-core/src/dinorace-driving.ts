import { racingLine, sampleRace } from "./race";
import type { RaceFrame, RacePoint } from "./race";

export const DINO_DRIVE_STEP = 1 / 60;
const LIMIT = 5.3;
export interface DinoDriveInput {
  readonly throttle: number;
  readonly brake: number;
  readonly steering: number;
}
export interface DinoDriveState extends RaceFrame {
  readonly lapSeconds: number;
  readonly laps: number;
  readonly checkpoint: number;
  readonly lastLap: number | null;
  readonly bestLap: number | null;
  readonly contact: boolean;
}
const bounded = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : 0;
const angleDifference = (a: number, b: number): number =>
  Math.atan2(Math.sin(a - b), Math.cos(a - b));
const segments = racingLine.slice(0, -1).map((a, index) => {
  const b = racingLine[index + 1] ?? a;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return { a, dx, dz, length: Math.hypot(dx, dz), index };
});
const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
interface TrackProjection extends RacePoint {
  readonly heading: number;
  readonly offset: number;
  readonly progress: number;
}
const projectToTrack = (point: RacePoint): TrackProjection => {
  let closest = Number.POSITIVE_INFINITY;
  let distance = 0;
  let result: TrackProjection = {
    x: 0,
    z: 0,
    heading: 0,
    offset: 0,
    progress: 0,
  };
  for (const segment of segments) {
    const { a, dx, dz, length } = segment;
    const t = bounded(
      ((point.x - a.x) * dx + (point.z - a.z) * dz) / (length * length),
      0,
      1
    );
    const x = a.x + dx * t;
    const z = a.z + dz * t;
    const squared = (point.x - x) ** 2 + (point.z - z) ** 2;
    if (squared < closest) {
      closest = squared;
      result = {
        x,
        z,
        heading: Math.atan2(dx, dz),
        offset: ((point.x - x) * dz - (point.z - z) * dx) / length,
        progress: (distance + length * t) / totalLength,
      };
    }
    distance += length;
  }
  return result;
};
export const createDinoDriveState = (): DinoDriveState => ({
  ...sampleRace(0),
  lapSeconds: 0,
  laps: 0,
  checkpoint: 0,
  lastLap: null,
  bestLap: null,
  contact: false,
});
const lapTiming = (state: DinoDriveState, progress: number) => {
  const lapSeconds = state.lapSeconds + DINO_DRIVE_STEP;
  const nextGate = (state.checkpoint + 1) / 4;
  const advance = progress - state.positionAlongTrack;
  const checkpoint =
    state.checkpoint < 3 &&
    advance > 0 &&
    advance < 0.05 &&
    state.positionAlongTrack < nextGate &&
    progress >= nextGate
      ? state.checkpoint + 1
      : state.checkpoint;
  const finished =
    checkpoint === 3 && state.positionAlongTrack > 0.9 && progress < 0.1;
  return finished
    ? {
        lapSeconds: 0,
        laps: state.laps + 1,
        checkpoint: 0,
        lastLap: lapSeconds,
        bestLap: Math.min(
          state.bestLap ?? Number.POSITIVE_INFINITY,
          lapSeconds
        ),
      }
    : {
        lapSeconds,
        laps: state.laps,
        checkpoint,
        lastLap: state.lastLap,
        bestLap: state.bestLap,
      };
};
/** Fixed-step arcade bicycle model. No clocks, renderer or transport; inputs can be replayed by a server. */
export const stepDinoDrive = (
  state: DinoDriveState,
  input: DinoDriveInput
): DinoDriveState => {
  const throttle = bounded(input.throttle, 0, 1);
  const brake = bounded(input.brake, 0, 1);
  const requestedSteering =
    (bounded(input.steering, -1, 1) * 0.52) / (1 + state.speed / 35);
  const steeringAmount =
    state.steeringAmount + (requestedSteering - state.steeringAmount) * 0.16;
  const drag = state.speed > 0 ? 0.5 + 0.012 * state.speed ** 2 : 0;
  const runoff = Math.abs(state.laneOffset) > 4.4 ? 6 : 0;
  let speed = bounded(
    state.speed +
      (throttle * 11 - brake * 24 - drag - runoff) * DINO_DRIVE_STEP,
    0,
    29
  );
  let heading =
    state.heading + (speed / 4.4) * Math.tan(steeringAmount) * DINO_DRIVE_STEP;
  let x = state.x + Math.sin(heading) * speed * DINO_DRIVE_STEP;
  let z = state.z + Math.cos(heading) * speed * DINO_DRIVE_STEP;
  const track = projectToTrack({ x, z });
  const contact = Math.abs(track.offset) > LIMIT;
  const laneOffset = bounded(track.offset, -LIMIT, LIMIT);
  if (contact) {
    x = track.x + Math.cos(track.heading) * laneOffset;
    z = track.z - Math.sin(track.heading) * laneOffset;
    const forward = Math.cos(heading - track.heading) >= 0;
    const tangent = track.heading + (forward ? 0 : Math.PI);
    speed *= 0.6;
    heading += angleDifference(tangent, heading) * 0.4;
  }
  let phase: RaceFrame["phase"] = "acceleration";
  if (speed < 0.1) {
    phase = "grid";
  } else if (brake > 0) {
    phase = "braking";
  } else if (Math.abs(steeringAmount) > 0.1) {
    phase = "corner";
  }
  return {
    x,
    z,
    heading: angleDifference(heading, 0),
    speed,
    laneOffset,
    steeringAmount,
    positionAlongTrack: track.progress,
    wheelRotation: state.wheelRotation + (speed * DINO_DRIVE_STEP) / 0.69,
    phase,
    contact,
    ...lapTiming(state, track.progress),
  };
};
/** Recovery retains the current lap and adds a penalty; it never advances checkpoints. */
export const recoverDinoDrive = (state: DinoDriveState): DinoDriveState => {
  const track = projectToTrack(state);
  return {
    ...state,
    x: track.x,
    z: track.z,
    heading: track.heading,
    positionAlongTrack: track.progress,
    speed: 0,
    laneOffset: 0,
    steeringAmount: 0,
    contact: false,
    lapSeconds: state.lapSeconds + 3,
  };
};
