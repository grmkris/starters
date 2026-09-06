import { Button } from "@agent-native/ui/components/button";
import { Effect } from "effect";
import { useEffect, useMemo, useRef, useState } from "react";

import { createDinoRaceAudio } from "../lib/dinorace-audio";
import type { DinoRaceTelemetry } from "../lib/dinorace-replay";

export const DinoRaceSound = ({
  telemetry,
}: {
  readonly telemetry: () => DinoRaceTelemetry;
}) => {
  const audio = useMemo(() => createDinoRaceAudio(), []);
  const mounted = useRef(false);
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    mounted.current = true;
    const interval = window.setInterval(() => {
      audio.update(telemetry());
    }, 50);
    const quiet = () => {
      audio.mute();
      setEnabled(false);
    };
    const visibility = () => {
      if (document.hidden) {
        quiet();
      }
    };
    window.addEventListener("blur", quiet);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      mounted.current = false;
      window.clearInterval(interval);
      window.removeEventListener("blur", quiet);
      document.removeEventListener("visibilitychange", visibility);
      void Effect.runPromise(audio.dispose);
    };
  }, [audio, telemetry]);
  const toggle = async () => {
    if (enabled) {
      audio.mute();
      setEnabled(false);
      return;
    }
    setPending(true);
    const ok = await Effect.runPromise(audio.enable);
    if (mounted.current) {
      setEnabled(ok);
      setFailed(!ok);
      setPending(false);
    }
  };
  return (
    <Button
      size="sm"
      className="pointer-events-auto ml-auto min-h-11"
      variant="outline"
      aria-label={enabled ? "Mute sound" : "Enable sound"}
      aria-pressed={enabled}
      disabled={pending}
      title={
        failed
          ? "Audio unavailable. Tap to retry, or continue muted."
          : "Synthesized engine and tyres"
      }
      onClick={() => {
        void toggle();
      }}
    >
      {enabled ? "SOUND ON" : "SOUND OFF"}
    </Button>
  );
};
