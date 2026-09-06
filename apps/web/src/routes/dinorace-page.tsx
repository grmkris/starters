import { DinoRaceManifest } from "@agent-native/domain";
import { DinoRaceCanvas } from "@agent-native/game-three";
import type {
  DinoRaceCamera,
  DinoRaceDebug,
  DinoRaceInspection,
  DinoRaceQuality,
} from "@agent-native/game-three";
import { Button } from "@agent-native/ui/components/button";
import { cn } from "@agent-native/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { Effect, Schema } from "effect";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  DinoRaceDrivingControls,
  DinoRaceSettings,
} from "../components/dinorace-driving-controls";
import { DinoRaceEngineering } from "../components/dinorace-engineering";
import { DinoRaceSound } from "../components/dinorace-sound";
import { DinoRaceTelemetryHud } from "../components/dinorace-telemetry";
import type { DinoDriveControl } from "../lib/dinorace-replay";
import { createDinoRaceReplay } from "../lib/dinorace-replay";

const drivingKeys = new Map<string, DinoDriveControl>([
  ["KeyW", "throttle"],
  ["ArrowUp", "throttle"],
  ["KeyS", "brake"],
  ["ArrowDown", "brake"],
  ["KeyA", "left"],
  ["ArrowLeft", "left"],
  ["KeyD", "right"],
  ["ArrowRight", "right"],
]);
const modeCopy = {
  drive: {
    start: "▶ DRIVE",
    session: "SOLO TIME TRIAL / YOU ARE DRIVING",
    hints: "WASD / ARROWS DRIVE · F RECOVER · F2 DEBUG",
  },
  demo: {
    start: "▶ PLAY DEMO",
    session: "SCRIPTED DEMO / AUTOPILOT",
    hints: "DRAG TO ORBIT · SCROLL TO ZOOM · 1 / 2 / 3 CAMERA",
  },
};
const assetUrl = "/dinorace-assets/scene.glb";
const manifestUrl = "/dinorace-assets/manifest.json";
const debugDefaults: DinoRaceDebug = {
  wireframe: true,
  bounds: true,
  rig: false,
  colliders: false,
  racingLine: true,
  cameraLine: false,
  labels: true,
  normals: false,
  lights: false,
};
const cleanDebug: DinoRaceDebug = {
  wireframe: false,
  bounds: false,
  rig: false,
  colliders: false,
  racingLine: false,
  cameraLine: false,
  labels: false,
  normals: false,
  lights: false,
};
const cameras: readonly DinoRaceCamera[] = [
  "cinematic",
  "chase",
  "trackside",
  "orbit",
];
const qualities: readonly DinoRaceQuality[] = ["auto", "low", "high", "insane"];
const inspections: readonly DinoRaceInspection[] = [
  "assembly",
  "driver",
  "vehicle",
];
const nextValue = <T,>(values: readonly T[], current: T): T =>
  values[(values.indexOf(current) + 1) % values.length] ?? current;

const DinoRaceFailure = ({
  message,
  manifest,
  retry,
}: {
  readonly message: string;
  readonly manifest: DinoRaceManifest | null;
  readonly retry: () => void;
}) => {
  const [diagnostics, setDiagnostics] = useState(false);
  return (
    <section className="dino-failure" role="alert">
      <p>DINO RACE</p>
      <h2>ASSET LOAD FAILED</h2>
      <p>The generated scene could not be opened.</p>
      <div>
        <Button onClick={retry}>Retry</Button>
        <Button
          variant="outline"
          onClick={() => {
            setDiagnostics((value) => !value);
          }}
        >
          View diagnostics
        </Button>
      </div>
      {diagnostics && (
        <pre>
          {assetUrl}
          {"\n"}Manifest: {manifest ? "available" : "unavailable"}
          {"\n"}Job: {manifest?.jobId ?? "unknown"}
          {"\n"}
          {message}
          {"\n"}Regenerate with: bun run dinorace:generate
        </pre>
      )}
    </section>
  );
};

export const DinoRacePage = () => {
  const replay = useMemo(() => createDinoRaceReplay(), []);
  const [manifest, setManifest] = useState<DinoRaceManifest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [nodes, setNodes] = useState<readonly string[]>([]);
  const [engineering, setEngineering] = useState(false);
  const [debug, setDebug] = useState(debugDefaults);
  const [camera, setCamera] = useState<DinoRaceCamera>("cinematic");
  const [quality, setQuality] = useState<DinoRaceQuality>("auto");
  const [inspection, setInspection] = useState<DinoRaceInspection>("assembly");
  const [telemetry, setTelemetry] = useState(replay.telemetry);
  const [interacted, setInteracted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const optionsClassName = cn({
    "[@media(pointer:coarse)]:hidden": !settingsOpen,
  });
  const reducedMotion = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );
  const palette = useMemo(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      void: style.getPropertyValue("--dino-void").trim(),
      cool: style.getPropertyValue("--dino-cool").trim(),
      warm: style.getPropertyValue("--dino-warm").trim(),
      paint: style.getPropertyValue("--dino-paint").trim(),
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const load = Effect.tryPromise({
      try: async () => {
        const response = await fetch(`${manifestUrl}?attempt=${attempt}`, {
          signal: controller.signal,
          cache: "no-cache",
        });
        if (!response.ok) {
          throw new Error(`Manifest HTTP ${response.status}: ${manifestUrl}`);
        }
        return Schema.decodeUnknownSync(DinoRaceManifest)(
          await response.json()
        );
      },
      catch: String,
    });
    const execute = async () => {
      try {
        const value = await Effect.runPromise(load);
        if (!controller.signal.aborted) {
          setManifest(value);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(String(error));
        }
      }
    };
    void execute();
    return () => {
      controller.abort();
    };
  }, [attempt]);
  const onReady = useCallback(
    (names: readonly string[]) => {
      setNodes(names);
      setReady(true);
      replay.ready();
    },
    [replay]
  );
  const onInspect = useCallback(() => {
    setInteracted(true);
    setCamera("orbit");
  }, []);
  const reset = useCallback(() => {
    replay.reset();
    setTelemetry(replay.telemetry());
    setCamera(replay.telemetry().mode === "drive" ? "chase" : "cinematic");
    setInspection("assembly");
    setInteracted(true);
  }, [replay]);
  const toggleRace = useCallback(() => {
    replay.toggle();
    if (replay.telemetry().mode === "drive") {
      setCamera("chase");
      setInspection("assembly");
    }
    setTelemetry(replay.telemetry());
    setInteracted(true);
  }, [replay]);
  const onControl = useCallback(
    (token: string, control: DinoDriveControl, active: boolean) => {
      if (active && control === "throttle" && !replay.telemetry().playing) {
        toggleRace();
      }
      replay.setControl(token, control, active);
    },
    [replay, toggleRace]
  );
  const recover = useCallback(() => {
    replay.recover();
    setCamera("chase");
    setTelemetry(replay.telemetry());
  }, [replay]);
  const switchMode = () => {
    const next = replay.telemetry().mode === "drive" ? "demo" : "drive";
    replay.setMode(next);
    replay.toggle();
    setTelemetry(replay.telemetry());
    setCamera(next === "drive" ? "chase" : "cinematic");
    setInspection("assembly");
    setInteracted(true);
  };
  useEffect(() => {
    let animation = 0;
    const pump = () => {
      replay.advance();
      animation = window.requestAnimationFrame(pump);
    };
    animation = window.requestAnimationFrame(pump);
    const interval = window.setInterval(() => {
      setTelemetry(replay.telemetry());
    }, 200);
    const key = (event: KeyboardEvent) => {
      const { target } = event;
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      if (
        target instanceof HTMLElement &&
        target.closest("input,textarea,select,[contenteditable=true]")
      ) {
        return;
      }
      const control = drivingKeys.get(event.code);
      if (
        ready &&
        replay.telemetry().mode === "drive" &&
        control !== undefined
      ) {
        event.preventDefault();
        if (event.repeat && !replay.telemetry().playing) {
          return;
        }
        onControl(event.code, control, true);
        return;
      }
      if (
        event.code === "Space" &&
        target instanceof HTMLElement &&
        target.closest("button")
      ) {
        return;
      }
      if (event.repeat || event.target instanceof HTMLInputElement) {
        return;
      }
      const actions = new Map<string, () => void>(
        Object.entries({
          " ": toggleRace,
          r: reset,
          d: () => {
            setEngineering((value) => !value);
          },
          f2: () => {
            setEngineering((value) => !value);
          },
          f: recover,
          c: () => {
            setCamera((value) => nextValue(cameras, value));
          },
          "1": () => {
            setCamera("cinematic");
          },
          "2": () => {
            setCamera("chase");
          },
          "3": () => {
            replay.pause();
            setCamera("orbit");
          },
        })
      );
      const action = actions.get(event.key.toLowerCase());
      if (action) {
        event.preventDefault();
        action();
        setInteracted(true);
      }
    };
    const visibility = () => {
      if (document.hidden) {
        replay.pause();
      }
    };
    const release = (event: KeyboardEvent) => {
      const control = drivingKeys.get(event.code);
      if (control !== undefined) {
        replay.setControl(event.code, control, false);
      }
    };
    const blur = () => {
      replay.pause();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", release);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.cancelAnimationFrame(animation);
      window.clearInterval(interval);
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", release);
      window.removeEventListener("blur", blur);
      replay.pause();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [replay, reset, toggleRace, onControl, recover, ready]);
  useEffect(() => {
    const timer =
      ready && !interacted
        ? window.setTimeout(
            () => {
              setCamera((value) => (value === "cinematic" ? "orbit" : value));
            },
            reducedMotion ? 0 : 12_000
          )
        : null;
    return () => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [ready, reducedMotion, interacted]);
  const retry = () => {
    setLoadError(null);
    setManifest(null);
    setReady(false);
    setAttempt((value) => value + 1);
  };
  const inspect = () => {
    replay.pause();
    setInspection((value) => nextValue(inspections, value));
    setCamera("orbit");
    setInteracted(true);
  };
  const { frame } = telemetry;
  const copy = modeCopy[telemetry.mode];

  return (
    <main
      className="dinorace"
      data-engineering={engineering}
      data-interacted={interacted}
      data-mode={telemetry.mode}
      data-steering={frame.steeringAmount.toFixed(3)}
    >
      <div
        className="dino-viewport"
        aria-label="Interactive dinosaur racing scene"
      >
        {manifest && loadError === null && (
          <DinoRaceCanvas
            key={attempt}
            assetUrl={`${assetUrl}?job=${manifest.jobId}&attempt=${attempt}`}
            asset={manifest}
            source={replay.source}
            camera={camera}
            debug={engineering ? debug : cleanDebug}
            engineering={engineering}
            inspection={inspection}
            quality={quality}
            palette={palette}
            metrics={replay.metrics}
            onReady={onReady}
            onError={setLoadError}
            onInspect={onInspect}
          />
        )}
      </div>
      <header className="dino-header">
        <Link
          to="/"
          className="dino-wordmark shrink-0 whitespace-nowrap"
          aria-label="Return to Field runtime"
        >
          DR<span> / </span>01
        </Link>
        <div className="dino-project">
          <h1>DINO RACE</h1>
          <span>MYTHIC MOTORSPORT DIVISION</span>
        </div>
        <DinoRaceSound telemetry={replay.telemetry} />
        <div className="dino-live">
          <span className="dino-status-dot" />
          {ready ? "REALTIME / WEBGL" : "ASSEMBLING SCENE"}
        </div>
      </header>
      {ready && loadError === null && (
        <>
          <div className="dino-session" data-testid="dinorace-ready">
            <span>EXPERIMENT 001</span>
            <span>{copy.session}</span>
          </div>
          {manifest && (
            <DinoRaceTelemetryHud
              telemetry={telemetry}
              identity={manifest.identity}
            />
          )}
          {engineering && manifest && (
            <DinoRaceEngineering
              manifest={manifest}
              metrics={replay.metrics}
              debug={debug}
              nodes={nodes}
              setDebug={setDebug}
              onClose={() => {
                setEngineering(false);
              }}
            />
          )}
          <footer className="dino-footer">
            <div className="dino-controls">
              <Button
                size="lg"
                onClick={toggleRace}
                aria-label={telemetry.playing ? "Pause race" : "Start race"}
              >
                {telemetry.playing ? "Ⅱ PAUSE" : copy.start}
                <kbd>SPACE</kbd>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={reset}
                aria-label="Reset race"
              >
                RESET <kbd>R</kbd>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCamera((value) => nextValue(cameras, value));
                  setInteracted(true);
                }}
                aria-label="Change camera"
                className={optionsClassName}
              >
                {camera.toUpperCase()} <kbd>C</kbd>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEngineering((value) => !value);
                }}
                aria-pressed={engineering}
                className={optionsClassName}
              >
                ENGINEERING <kbd>F2</kbd>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="hidden [@media(pointer:coarse)]:inline-flex"
                aria-expanded={settingsOpen}
                onClick={() => {
                  setSettingsOpen((value) => !value);
                }}
              >
                OPTIONS
              </Button>
            </div>
            <div className={optionsClassName}>
              <DinoRaceSettings
                mode={telemetry.mode}
                inspection={inspection}
                quality={quality}
                onSwitch={switchMode}
                onRecover={recover}
                onInspect={inspect}
                onQuality={() => {
                  setQuality((value) => nextValue(qualities, value));
                }}
              />
            </div>
            {telemetry.mode === "drive" && (
              <DinoRaceDrivingControls onControl={onControl} />
            )}
            <div
              className="dino-caption"
              style={
                telemetry.mode === "drive" ? { display: "none" } : undefined
              }
            >
              <span>GENERATED IN BLENDER. ALIVE IN YOUR BROWSER.</span>
              <span className="dino-hints">{copy.hints}</span>
            </div>
          </footer>
        </>
      )}
      {!ready && loadError === null && (
        <output className="dino-loading">
          <span>DINO RACE</span>
          <small>LOADING GENERATED ASSET / EXPERIMENT 01</small>
        </output>
      )}
      {ready && !reducedMotion && !interacted && (
        <div className="dino-intro" aria-hidden="true">
          <span>DINO RACE</span>
          <small>EXPERIMENT 01</small>
        </div>
      )}
      {loadError !== null && (
        <DinoRaceFailure
          message={loadError}
          manifest={manifest}
          retry={retry}
        />
      )}
    </main>
  );
};
