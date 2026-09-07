import type { ZelenoSource } from "@agent-native/game-three";
import { Effect, Fiber, Schedule } from "effect";
import { useEffect, useMemo, useRef, useState } from "react";

type Stage =
  | "idle"
  | "ordering"
  | "picking"
  | "packing"
  | "payment"
  | "delivery"
  | "complete";

const stageAt = (time: number): Stage => {
  if (time === 0) {
    return "idle";
  }
  if (time < 3) {
    return "ordering";
  }
  if (time < 15) {
    return "picking";
  }
  if (time < 18) {
    return "packing";
  }
  if (time === 18) {
    return "payment";
  }
  return time < 22 ? "delivery" : "complete";
};

export const useZelenoDemo = (reducedMotion: boolean) => {
  const clock = useRef({ time: 0, running: false, lastUpdate: 0 });
  const [time, setTime] = useState(0);
  const [running, setRunning] = useState(false);
  const source: ZelenoSource = useMemo(
    () => ({
      getTime: () => {
        const { current } = clock;
        if (!current.running || reducedMotion) {
          return current.time;
        }
        const limit = current.time < 18 ? 18 : 22;
        return Math.min(
          limit,
          current.time + (performance.now() - current.lastUpdate) / 1000
        );
      },
    }),
    [reducedMotion]
  );

  useEffect(() => {
    const fiber = Effect.runFork(
      Effect.sync(() => {
        const { current } = clock;
        const now = performance.now();
        if (current.running && !document.hidden) {
          const limit = current.time < 18 ? 18 : 22;
          current.time = reducedMotion
            ? limit
            : Math.min(limit, current.time + (now - current.lastUpdate) / 1000);
          setTime(current.time);
          if (current.time === limit) {
            current.running = false;
            setRunning(false);
          }
        }
        current.lastUpdate = now;
      }).pipe(Effect.repeat({ schedule: Schedule.spaced("50 millis") }))
    );
    const handleVisibility = () => {
      if (document.hidden) {
        clock.current.running = false;
        setRunning(false);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      Effect.runFork(Fiber.interrupt(fiber));
    };
  }, [reducedMotion]);

  const play = () => {
    clock.current.lastUpdate = performance.now();
    clock.current.running = true;
    if (clock.current.time === 0) {
      clock.current.time = 0.01;
      setTime(0.01);
    }
    setRunning(true);
  };
  const pause = () => {
    clock.current.running = false;
    setRunning(false);
  };
  const pay = () => {
    if (clock.current.time !== 18) {
      return;
    }
    clock.current.time = 18.01;
    play();
  };
  const reset = () => {
    clock.current = { time: 0, running: false, lastUpdate: 0 };
    setRunning(false);
    setTime(0);
  };
  return {
    source,
    time,
    stage: stageAt(time),
    running,
    play,
    pause,
    pay,
    reset,
  };
};
