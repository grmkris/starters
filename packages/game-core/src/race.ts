/** An authored replay, independent of clocks, hosts, renderers and transport. Units: metres/seconds. */
export interface RacePoint {
  readonly x: number;
  readonly z: number;
}
export interface RaceFrame {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly positionAlongTrack: number;
  readonly speed: number;
  readonly laneOffset: number;
  readonly wheelRotation: number;
  readonly steeringAmount: number;
  readonly phase:
    | "grid"
    | "launch"
    | "acceleration"
    | "corner"
    | "overtake"
    | "braking"
    | "finish";
}
const controls: readonly RacePoint[] = [
  { x: 0, z: 0 },
  { x: 0, z: 40 },
  { x: 20, z: 65 },
  { x: 58, z: 57 },
  { x: 72, z: 22 },
  { x: 56, z: -22 },
  { x: 22, z: -40 },
  { x: 0, z: -30 },
];
const at = (index: number): RacePoint =>
  controls[(index + controls.length) % controls.length] ?? { x: 0, z: 0 };
const cubic = (a: number, b: number, c: number, d: number, t: number): number =>
  0.5 *
  (2 * b +
    (-a + c) * t +
    (2 * a - 5 * b + 4 * c - d) * t * t +
    (-a + 3 * b - 3 * c + d) * t * t * t);
const splinePoint = (t: number): RacePoint => {
  const scaled = t * controls.length;
  const i = Math.floor(scaled);
  const u = scaled - i;
  const [a, b, c, d] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
  return { x: cubic(a.x, b.x, c.x, d.x, u), z: cubic(a.z, b.z, c.z, d.z, u) };
};
export const racingLine: readonly RacePoint[] = Array.from(
  { length: 513 },
  (_, i) => splinePoint(i / 512)
);
const cumulative = [0];
for (let i = 1; i < racingLine.length; i += 1) {
  const previous = racingLine[i - 1];
  const current = racingLine[i];
  cumulative.push(
    (cumulative[i - 1] ?? 0) +
      (previous && current
        ? Math.hypot(current.x - previous.x, current.z - previous.z)
        : 0)
  );
}
export const raceTrackLength = cumulative.at(-1) ?? 1;
export const raceDuration = 32;
const speedKeys: readonly (readonly [number, number])[] = [
  [0, 0],
  [2, 3],
  [6, 22],
  [10, 28],
  [14, 14],
  [19, 25],
  [24, 27],
  [29, 12],
  [32, 0],
];
const profile = (time: number) => {
  let distance = 0;
  for (let i = 1; i < speedKeys.length; i += 1) {
    const a = speedKeys[i - 1];
    const b = speedKeys[i];
    if (!(a && b)) {
      continue;
    }
    const duration = b[0] - a[0];
    const dt = Math.max(0, Math.min(duration, time - a[0]));
    const speed = a[1] + ((b[1] - a[1]) * dt) / duration;
    distance += ((a[1] + speed) * dt) / 2;
    if (time <= b[0]) {
      return { speed, distance };
    }
  }
  return { speed: 0, distance };
};
const distanceScale = raceTrackLength / profile(raceDuration).distance;
const samplePath = (distance: number): RacePoint => {
  const wrapped =
    ((distance % raceTrackLength) + raceTrackLength) % raceTrackLength;
  let low = 0;
  let high = cumulative.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if ((cumulative[middle] ?? 0) < wrapped) {
      low = middle;
    } else {
      high = middle;
    }
  }
  const a = racingLine[low] ?? at(0);
  const b = racingLine[high] ?? at(0);
  const fraction =
    (wrapped - (cumulative[low] ?? 0)) /
    Math.max(0.001, (cumulative[high] ?? 0) - (cumulative[low] ?? 0));
  return { x: a.x + (b.x - a.x) * fraction, z: a.z + (b.z - a.z) * fraction };
};
const phaseAt = (time: number): RaceFrame["phase"] => {
  if (time <= 0) {
    return "grid";
  }
  if (time < 3) {
    return "launch";
  }
  if (time < 10) {
    return "acceleration";
  }
  if (time < 16) {
    return "corner";
  }
  if (time < 24) {
    return "overtake";
  }
  return time < raceDuration ? "braking" : "finish";
};
/** Fixed 60 Hz replay samples can be interpolated by any renderer without integrating render delta. */
export const sampleRace = (seconds: number): RaceFrame => {
  const t = Math.min(raceDuration, Math.max(0, seconds));
  const motion = profile(t);
  const distance = motion.distance * distanceScale;
  const point = samplePath(distance);
  const ahead = samplePath(distance + 0.25);
  const behind = samplePath(distance - 0.25);
  const heading = Math.atan2(ahead.x - behind.x, ahead.z - behind.z);
  const laneOffset =
    t > 16 && t < 24 ? Math.sin(((t - 16) / 8) * Math.PI) * 2.5 : 0;
  const next = samplePath(distance + 2);
  const bend = Math.atan2(next.x - point.x, next.z - point.z) - heading;
  return {
    x: point.x + Math.cos(heading) * laneOffset,
    z: point.z - Math.sin(heading) * laneOffset,
    heading,
    speed: motion.speed * distanceScale,
    positionAlongTrack: distance / raceTrackLength,
    laneOffset,
    wheelRotation: distance / 0.69,
    steeringAmount: Math.atan2(Math.sin(bend), Math.cos(bend)),
    phase: phaseAt(t),
  };
};
