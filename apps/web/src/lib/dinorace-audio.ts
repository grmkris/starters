import { Effect } from "effect";

import type { DinoRaceTelemetry } from "./dinorace-replay";

/** Host-side synthesis, like duel feedback: no samples, downloads or simulation side effects. */
const createGraph = () => {
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = 0;
  master.connect(context.destination);
  const engine = context.createOscillator();
  engine.type = "sawtooth";
  const bass = context.createOscillator();
  bass.type = "triangle";
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.6;
  const motor = context.createGain();
  motor.gain.value = 0.12;
  engine.connect(filter);
  bass.connect(filter);
  filter.connect(motor).connect(master);
  const noise = context.createBufferSource();
  const buffer = context.createBuffer(
    1,
    context.sampleRate,
    context.sampleRate
  );
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.random() * 2 - 1;
  }
  noise.buffer = buffer;
  noise.loop = true;
  const tyreFilter = context.createBiquadFilter();
  tyreFilter.type = "bandpass";
  tyreFilter.frequency.value = 1400;
  const tyres = context.createGain();
  tyres.gain.value = 0;
  noise.connect(tyreFilter).connect(tyres).connect(master);
  engine.start();
  bass.start();
  noise.start();
  return { context, master, engine, bass, filter, motor, noise, tyres };
};

export const createDinoRaceAudio = () => {
  let graph: ReturnType<typeof createGraph> | null = null;
  let enabled = false;
  let gear = 0;
  let revision = 0;
  const mute = (): void => {
    enabled = false;
    revision += 1;
    if (graph) {
      graph.master.gain.cancelScheduledValues(graph.context.currentTime);
      graph.master.gain.setValueAtTime(0, graph.context.currentTime);
    }
  };
  const enable = Effect.tryPromise({
    try: async () => {
      graph ??= createGraph();
      const current = graph;
      revision += 1;
      const requested = revision;
      await current.context.resume();
      enabled =
        requested === revision &&
        graph === current &&
        current.context.state === "running";
      return enabled;
    },
    catch: String,
  }).pipe(Effect.orElseSucceed(() => false));
  const dispose = Effect.tryPromise({
    try: async () => {
      mute();
      const previous = graph;
      graph = null;
      if (previous) {
        previous.engine.stop();
        previous.bass.stop();
        previous.noise.stop();
        await previous.context.close();
      }
    },
    catch: String,
  }).pipe(Effect.ignore);
  return {
    enable,
    mute,
    dispose,
    update: (state: DinoRaceTelemetry): void => {
      if (!graph || !enabled || graph.context.state !== "running") {
        return;
      }
      const { context, master, engine, bass, filter, motor, tyres } = graph;
      const now = context.currentTime;
      const speed = state.frame.speed * 3.6;
      const nextGear = Math.min(7, Math.floor(speed / 18) + 1);
      const revs = 65 + (speed % 18) * 7 + nextGear * 12;
      master.gain.setTargetAtTime(state.playing ? 0.65 : 0, now, 0.025);
      engine.frequency.setTargetAtTime(revs, now, 0.06);
      bass.frequency.setTargetAtTime(revs * 0.5, now, 0.06);
      filter.frequency.setTargetAtTime(
        420 + speed * 13 + Number(state.throttle) * 500,
        now,
        0.08
      );
      if (nextGear !== gear && state.playing) {
        motor.gain.cancelScheduledValues(now);
        motor.gain.setValueAtTime(0.025, now);
        motor.gain.setTargetAtTime(0.12, now + 0.06, 0.04);
      }
      gear = nextGear;
      const scrub = (Math.abs(state.frame.steeringAmount) * speed) / 130;
      const braking = state.brake ? Math.min(speed / 70, 0.6) : 0;
      const contact = state.contact ? 0.3 : 0;
      tyres.gain.setTargetAtTime(
        Math.min(0.3, speed * 0.0004 + scrub + braking + contact),
        now,
        0.04
      );
    },
  };
};
