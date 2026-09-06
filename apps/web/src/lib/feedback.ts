import type { DuelEvent, DuelSource } from "@agent-native/game-three";

/**
 * What a duel sounds and feels like, from the same events the renderer draws.
 *
 * Every sound is synthesised on the spot - an oscillator or a burst of noise
 * through a short envelope - so there are no audio files to load or cache.
 * Browsers refuse to start audio until the page has been touched, so the
 * context is created on the first pointer or key and resumed whenever the
 * page comes back into view. Vibration is used where the browser offers it,
 * which today means Android; iOS Safari ignores it without complaint.
 */

export interface Feedback {
  readonly stop: () => void;
}

interface Tone {
  readonly type: OscillatorType;
  readonly from: number;
  readonly to?: number;
  readonly seconds: number;
  readonly gain: number;
  readonly delay?: number;
}

const HIT_BUZZ_MS = 40;
const OWN_HIT_BUZZ_MS = 70;
const ROUND_PATTERN = [40, 60, 40];
const MATCH_PATTERN = [80, 60, 80, 60, 140];

const buzz = (pattern: number | number[]): void => {
  if ("vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
};

const createNoise = (context: AudioContext, seconds: number): AudioBuffer => {
  const buffer = context.createBuffer(
    1,
    Math.ceil(context.sampleRate * seconds),
    context.sampleRate
  );
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }
  return buffer;
};

export const startFeedback = (
  source: DuelSource,
  localClientId: () => string | null
): Feedback => {
  let context: AudioContext | null = null;

  const unlock = (): void => {
    if (context === null && "AudioContext" in window) {
      context = new AudioContext();
    }
    if (context !== null && context.state === "suspended") {
      void context.resume();
    }
  };

  const tone = ({ delay = 0, from, gain, seconds, to, type }: Tone): void => {
    if (context === null || context.state !== "running") {
      return;
    }
    const at = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, at);
    if (to !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(to, at + seconds);
    }
    envelope.gain.setValueAtTime(gain, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    oscillator.connect(envelope).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + seconds + 0.02);
  };

  const noise = (seconds: number, gain: number): void => {
    if (context === null || context.state !== "running") {
      return;
    }
    const at = context.currentTime;
    const player = context.createBufferSource();
    const envelope = context.createGain();
    const filter = context.createBiquadFilter();
    player.buffer = createNoise(context, seconds);
    filter.type = "bandpass";
    filter.frequency.value = 1800;
    envelope.gain.setValueAtTime(gain, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    player.connect(filter).connect(envelope).connect(context.destination);
    player.start(at);
  };

  const onEvent = (event: DuelEvent): void => {
    switch (event.kind) {
      case "fire": {
        noise(0.06, 0.18);
        tone({ from: 320, gain: 0.12, seconds: 0.08, to: 120, type: "sine" });
        return;
      }
      case "bounce": {
        tone({ from: 900, gain: 0.08, seconds: 0.03, type: "square" });
        return;
      }
      case "cross": {
        tone({
          from: 400,
          gain: 0.05,
          seconds: 0.12,
          to: 800,
          type: "triangle",
        });
        return;
      }
      case "hit": {
        const mine = event.clientId === localClientId();
        tone({
          from: mine ? 90 : 130,
          gain: 0.3,
          seconds: 0.18,
          to: 40,
          type: "sine",
        });
        noise(0.05, 0.12);
        buzz(mine ? OWN_HIT_BUZZ_MS : HIT_BUZZ_MS);
        return;
      }
      case "round": {
        tone({ from: 523, gain: 0.12, seconds: 0.12, type: "triangle" });
        tone({
          delay: 0.13,
          from: 784,
          gain: 0.12,
          seconds: 0.18,
          type: "triangle",
        });
        buzz(ROUND_PATTERN);
        return;
      }
      case "match": {
        for (const [index, from] of [523, 659, 784].entries()) {
          tone({
            delay: index * 0.14,
            from,
            gain: 0.14,
            seconds: 0.2,
            type: "triangle",
          });
        }
        buzz(MATCH_PATTERN);
      }
    }
  };

  const onVisible = (): void => {
    if (!document.hidden) {
      unlock();
    }
  };

  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  document.addEventListener("visibilitychange", onVisible);
  const unsubscribe = source.subscribeEvents(onEvent);

  return {
    stop: () => {
      unsubscribe();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", onVisible);
      void context?.close();
      context = null;
    },
  };
};
