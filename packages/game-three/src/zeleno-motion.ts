const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
const mix = (from: number, to: number, t: number) =>
  from + (to - from) * smooth(t);

export interface ZelenoPose {
  x: number;
  y: number;
  z: number;
  grip: number;
  item: number;
  carrying: boolean;
}

// One continuous path, with the wrist 18 cm above each produce anchor.
export const sampleZelenoPose = (time: number, pose: ZelenoPose) => {
  pose.x = -0.6;
  pose.y = 1.58;
  pose.z = 0.25;
  pose.grip = 1;
  pose.item = Math.min(2, Math.max(0, Math.floor((time - 3) / 4)));
  pose.carrying = false;
  if (time < 3) {
    return;
  }
  if (time >= 15) {
    pose.x = mix(2.27, -0.6, (time - 15) / 2);
    return;
  }
  const t = (time - 3) % 4;
  const shelfX = -2.29 + pose.item * 0.97;
  const boxX = 1.83 + pose.item * 0.22;
  const previousX = pose.item === 0 ? -0.6 : 1.83 + (pose.item - 1) * 0.22;
  if (t < 1) {
    pose.x = mix(previousX, shelfX, t);
    pose.y = 1.58 + Math.sin(smooth(t) * Math.PI) * 0.2;
    pose.z = mix(0.25, -0.685, t);
  } else if (t < 1.7) {
    pose.x = shelfX;
    pose.z = -0.685;
    pose.y =
      t < 1.35
        ? mix(1.58, 1.5, (t - 1) / 0.35)
        : mix(1.5, 1.68, (t - 1.35) / 0.35);
    pose.grip = 1 - smooth((t - 1.15) / 0.2) * 0.28;
  } else if (t < 2.9) {
    const travel = smooth((t - 1.7) / 1.2);
    pose.x = shelfX + (boxX - shelfX) * travel;
    pose.y = 1.68 + Math.sin(travel * Math.PI) * 0.12;
    pose.z = -0.685 + 0.935 * travel;
    pose.grip = 0.72;
  } else {
    pose.x = boxX;
    pose.z = 0.25;
    pose.y =
      t < 3.35
        ? mix(1.68, 1.245, (t - 2.9) / 0.45)
        : mix(1.245, 1.58, (t - 3.35) / 0.65);
    pose.grip = 0.72 + smooth((t - 3.35) / 0.2) * 0.28;
  }
  pose.carrying = t >= 1.35 && t < 3.35;
};
