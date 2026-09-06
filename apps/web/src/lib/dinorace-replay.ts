import {
  createDinoDriveState,
  DINO_DRIVE_STEP,
  raceDuration,
  racingLine,
  recoverDinoDrive,
  sampleRace,
  stepDinoDrive,
} from "@agent-native/game-core";
import type { DinoRaceMetrics, DinoRaceSource } from "@agent-native/game-three";

export type DinoRaceMode = "drive" | "demo";
export type DinoDriveControl = "throttle" | "brake" | "left" | "right";

/** The app advances simulation. Renderer reads only interpolate already-completed fixed ticks. */
export const createDinoRaceReplay = (
  clock: () => number = () => performance.now()
) => {
  let playing = false;
  let mode: DinoRaceMode = "drive";
  let elapsed = 0;
  let started = 0;
  let intro = clock();
  const loadStarted = intro;
  let lastTick = intro;
  let accumulator = 0;
  let current = createDinoDriveState();
  let previous = current;
  const controls = new Map<string, DinoDriveControl>();
  const time = (): number =>
    Math.min(
      raceDuration,
      elapsed + (playing ? (clock() - started) / 1000 : 0)
    );
  const metrics: DinoRaceMetrics = {
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    fps: 0,
    loadMs: 0,
  };
  const source: DinoRaceSource = {
    track: racingLine,
    getIntroTime: () => (clock() - intro) / 1000,
    getFrame: () => {
      const tick = time() * 60;
      const a = mode === "drive" ? previous : sampleRace(Math.floor(tick) / 60);
      const b =
        mode === "drive" ? current : sampleRace((Math.floor(tick) + 1) / 60);
      let blend = tick % 1;
      if (mode === "drive") {
        blend = playing ? accumulator / DINO_DRIVE_STEP : 1;
      }
      const angle = b.heading - a.heading;
      return {
        ...b,
        x: a.x + (b.x - a.x) * blend,
        z: a.z + (b.z - a.z) * blend,
        heading:
          a.heading + Math.atan2(Math.sin(angle), Math.cos(angle)) * blend,
        wheelRotation:
          a.wheelRotation + (b.wheelRotation - a.wheelRotation) * blend,
      };
    },
  };
  const pause = (): void => {
    elapsed = time();
    playing = false;
    controls.clear();
    accumulator = 0;
    previous = current;
  };
  const reset = (): void => {
    pause();
    elapsed = 0;
    current = { ...createDinoDriveState(), bestLap: current.bestLap };
    previous = current;
    lastTick = clock();
    intro = lastTick;
  };
  return {
    source,
    metrics,
    ready: () => {
      intro = clock();
      lastTick = intro;
      metrics.loadMs = intro - loadStarted;
    },
    advance: () => {
      const now = clock();
      // Bounded catch-up prevents a suspended browser from teleporting the car.
      const delta = Math.max(0, Math.min(0.25, (now - lastTick) / 1000));
      lastTick = now;
      if (!playing || mode !== "drive") {
        return;
      }
      accumulator += delta;
      const pressed = new Set(controls.values());
      const input = {
        throttle: pressed.has("throttle") ? 1 : 0,
        brake: pressed.has("brake") ? 1 : 0,
        // +Z forward means the driver’s right is -X (negative yaw).
        steering: Number(pressed.has("left")) - Number(pressed.has("right")),
      };
      while (accumulator + 1e-9 >= DINO_DRIVE_STEP) {
        previous = current;
        current = stepDinoDrive(current, input);
        accumulator = Math.max(0, accumulator - DINO_DRIVE_STEP);
      }
    },
    telemetry: () => ({
      frame: mode === "drive" ? current : sampleRace(time()),
      mode,
      playing: playing && (mode === "drive" || time() < raceDuration),
      elapsed: mode === "drive" ? current.lapSeconds : time(),
      lap: current.laps + 1,
      lastLap: current.lastLap,
      bestLap: current.bestLap,
      contact: mode === "drive" && current.contact,
      throttle: [...controls.values()].includes("throttle"),
      brake: [...controls.values()].includes("brake"),
    }),
    setControl: (
      token: string,
      control: DinoDriveControl,
      active: boolean
    ): void => {
      if (active && mode === "drive") {
        controls.set(token, control);
      } else {
        controls.delete(token);
      }
    },
    setMode: (next: DinoRaceMode): void => {
      reset();
      mode = next;
    },
    recover: (): void => {
      controls.clear();
      current = recoverDinoDrive(current);
      previous = current;
      accumulator = 0;
    },
    toggle: () => {
      if (playing) {
        pause();
      } else {
        if (elapsed >= raceDuration) {
          elapsed = 0;
        }
        started = clock();
        lastTick = started;
        playing = true;
      }
    },
    pause,
    reset,
  };
};

export type DinoRaceTelemetry = ReturnType<
  ReturnType<typeof createDinoRaceReplay>["telemetry"]
>;
