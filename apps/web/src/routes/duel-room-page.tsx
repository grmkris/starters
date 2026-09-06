import { DUEL_FIELD, RoomCode } from "@agent-native/domain";
import type { DuelPlayerSnapshot, Side } from "@agent-native/domain";
import { DuelCanvas } from "@agent-native/game-three";
import type { DuelLayout, ModelState } from "@agent-native/game-three";
import { Button } from "@agent-native/ui/components/button";
import { cn } from "@agent-native/ui/lib/utils";
import { Link, useParams } from "@tanstack/react-router";
import { Result, Schema } from "effect";
import QRCode from "qrcode";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";

import { useLaneInput } from "../hooks/use-lane-input";
import { startFeedback } from "../lib/feedback";
import { realtimeStore } from "../lib/realtime-store";
import type { DuelMeta } from "../lib/realtime-store";
import { readScenePalette } from "../lib/scene-palette";
import { keepAwake } from "../lib/wake-lock";

const decodeCode = Schema.decodeUnknownResult(RoomCode);

const FIELD = {
  halfWidth: DUEL_FIELD.halfWidth,
  laneHalfHeight: DUEL_FIELD.laneHalfHeight,
};

/**
 * Where a model would live. Nothing there means the procedural tank.
 * `?models=fixture` loads the hand-written stand-in the browser tests use,
 * and `?models=off` asks for no model at all. The file is probed before it
 * is handed to the loader, so an absent model never starts a load that
 * fails and is logged; the slot simply gets no URL.
 */
const modelUrl = (): string | null => {
  const choice = new URLSearchParams(window.location.search).get("models");
  if (choice === "off") {
    return null;
  }
  return choice === "fixture"
    ? "/models/fixture/player.glb"
    : "/models/player.glb";
};

const probeModel = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return (
      response.ok &&
      (response.headers.get("content-type") ?? "").startsWith("model/")
    );
  } catch {
    return false;
  }
};

const LANDSCAPE = "(orientation: landscape)";

const currentLayout = (): DuelLayout =>
  window.matchMedia(LANDSCAPE).matches ? "landscape" : "portrait";

interface HealthPipsProps {
  readonly health: number;
  readonly label: string;
}

const HealthPips = ({ health, label }: HealthPipsProps) => (
  <div
    aria-label={`${label}: ${health} of 3`}
    className="flex items-center gap-1.5"
  >
    <span className="text-muted-foreground font-mono text-[0.6rem] tracking-[0.18em]">
      {label}
    </span>
    {[0, 1, 2].map((pip) => (
      <span
        className={cn(
          "size-2.5 rounded-full border",
          pip < health ? "bg-primary border-primary" : "border-border"
        )}
        key={pip}
      />
    ))}
  </div>
);

const ShareCode = ({ code }: { readonly code: string }) => {
  const [qr, setQr] = useState<string | null>(null);
  const link = `${window.location.origin}/duel/${code}`;

  useEffect(() => {
    let cancelled = false;
    const render = async (): Promise<void> => {
      const url = await QRCode.toDataURL(link, {
        color: { dark: "#e6ede8ff", light: "#00000000" },
        margin: 1,
        width: 220,
      });
      if (!cancelled) {
        setQr(url);
      }
    };
    void render();
    return () => {
      cancelled = true;
    };
  }, [link]);

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <p className="text-muted-foreground font-mono text-xs tracking-[0.2em]">
        SHOW THIS TO THE OTHER PHONE
      </p>
      <p
        className="text-primary font-mono text-6xl font-semibold tracking-[0.3em]"
        data-testid="duel-code"
      >
        {code}
      </p>
      {qr === null ? null : (
        <img
          alt={`Join link for duel ${code}`}
          className="size-[220px]"
          src={qr}
        />
      )}
      <p className="text-muted-foreground max-w-xs text-sm">
        Or open <span className="font-mono">{link}</span> there.
      </p>
    </div>
  );
};

interface OverlayProps {
  readonly children: ReactNode;
  readonly testId: string;
}

const Overlay = ({ children, testId }: OverlayProps) => (
  <div
    className="bg-background/70 pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center backdrop-blur-sm"
    data-testid={testId}
  >
    {children}
  </div>
);

interface PhaseOverlayProps {
  readonly code: string;
  readonly duel: DuelMeta;
  readonly layout: DuelLayout;
  readonly me: DuelPlayerSnapshot | undefined;
  readonly side: Side | null;
}

const seamHint = (layout: DuelLayout, side: Side | null): string => {
  if (layout === "landscape") {
    return side === -1 ? "THE SEAM IS BELOW YOU" : "THE SEAM IS ABOVE YOU";
  }
  return side === -1 ? "THE SEAM IS TO YOUR RIGHT" : "THE SEAM IS TO YOUR LEFT";
};

/** What sits over the lane in each phase. Nothing during play. */
const PhaseOverlay = ({ code, duel, layout, me, side }: PhaseOverlayProps) => {
  if (duel.error !== null) {
    return (
      <Overlay testId="duel-error">
        <p className="text-destructive font-mono text-sm">{duel.error}</p>
        <Link className="text-primary pointer-events-auto underline" to="/duel">
          Back
        </Link>
      </Overlay>
    );
  }

  switch (duel.phase) {
    case null:
    case "waiting": {
      return (
        <Overlay testId="duel-waiting">
          <ShareCode code={code} />
          <p className="text-muted-foreground font-mono text-xs tracking-[0.2em]">
            {duel.phase === null ? "JOINING…" : "WAITING FOR AN OPPONENT"}
          </p>
        </Overlay>
      );
    }
    case "countdown": {
      return (
        <Overlay testId="duel-countdown">
          <p className="text-primary font-mono text-8xl font-semibold">
            {Math.ceil(duel.countdown)}
          </p>
          <p className="text-muted-foreground font-mono text-xs tracking-[0.2em]">
            {seamHint(layout, side)}
          </p>
        </Overlay>
      );
    }
    case "roundOver": {
      return (
        <Overlay testId="duel-round-over">
          <p className="text-4xl font-semibold tracking-[-0.04em]">
            {duel.winner === side ? "Round to you" : "Round to them"}
          </p>
        </Overlay>
      );
    }
    case "matchOver": {
      const asked = me?.rematch === true;
      return (
        <Overlay testId="duel-match-over">
          <p className="text-4xl font-semibold tracking-[-0.04em]">
            {duel.winner === side ? "You won" : "They won"}
          </p>
          <Button
            className="pointer-events-auto"
            disabled={asked}
            onClick={() => {
              realtimeStore.duelRematch();
            }}
            size="lg"
          >
            {asked ? "Waiting for them…" : "Rematch"}
          </Button>
        </Overlay>
      );
    }
    case "playing": {
      // Play: the lane is the whole interface.
      return null;
    }
    default: {
      return null;
    }
  }
};

interface HudProps {
  readonly me: DuelPlayerSnapshot | undefined;
  readonly round: number;
  readonly them: DuelPlayerSnapshot | undefined;
}

const Hud = ({ me, round, them }: HudProps) => (
  <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
    <div className="flex flex-col gap-2">
      {me === undefined ? null : <HealthPips health={me.health} label="YOU" />}
      {them === undefined ? null : (
        <HealthPips health={them.health} label="THEM" />
      )}
    </div>
    <div className="text-muted-foreground text-right font-mono text-[0.65rem] leading-5">
      <p>ROUND / {round === 0 ? "—" : round}</p>
      <p data-testid="duel-score">
        {me?.rounds ?? 0} – {them?.rounds ?? 0}
      </p>
    </div>
  </div>
);

const InvalidCode = () => (
  <main
    className="mx-auto max-w-md p-6"
    data-phase="invalid"
    data-testid="duel-root"
  >
    <p className="text-destructive font-mono text-sm">
      That is not a duel code.
    </p>
    <Link className="text-primary mt-4 inline-block underline" to="/duel">
      Back
    </Link>
  </main>
);

export const DuelRoomPage = () => {
  const { code } = useParams({ strict: false });
  const palette = useMemo(() => readScenePalette(), []);
  const meta = useSyncExternalStore(
    realtimeStore.subscribeMeta,
    realtimeStore.getMetaSnapshot,
    realtimeStore.getMetaSnapshot
  );
  const duel = useSyncExternalStore(
    realtimeStore.subscribeDuel,
    realtimeStore.getDuelSnapshot,
    realtimeStore.getDuelSnapshot
  );
  const surface = useRef<HTMLDivElement>(null);
  // No model asked for is the fallback from the start; otherwise the slot's
  // state is whatever the probe and the loader report.
  const [modelState, setModelState] = useState<ModelState | null>(() =>
    modelUrl() === null ? "fallback" : null
  );
  const [models, setModels] = useState<
    { readonly player: string } | undefined
  >();
  const [layout, setLayout] = useState<DuelLayout>(currentLayout);

  useEffect(() => {
    let cancelled = false;
    const url = modelUrl();
    if (url === null) {
      return () => {
        cancelled = true;
      };
    }
    const look = async (): Promise<void> => {
      const present = await probeModel(url);
      if (cancelled) {
        return;
      }
      if (present) {
        setModels({ player: url });
      } else {
        setModelState("fallback");
      }
    };
    void look();
    return () => {
      cancelled = true;
    };
  }, []);

  // Held upright, two phones sit side by side; held sideways, they stack.
  // The lane follows the phone rather than asking the phone to turn.
  useEffect(() => {
    const query = window.matchMedia(LANDSCAPE);
    const onChange = (): void => {
      setLayout(query.matches ? "landscape" : "portrait");
    };
    query.addEventListener("change", onChange);
    return () => {
      query.removeEventListener("change", onChange);
    };
  }, []);

  const parsed = decodeCode(code ?? "");
  const validCode = Result.isSuccess(parsed) ? parsed.success : null;

  // Find the room the code names, unless this page was reached from creating
  // it, in which case the store already knows. Leaving the page leaves the room.
  useEffect(() => {
    if (validCode !== null && realtimeStore.getDuelSnapshot().roomId === null) {
      realtimeStore.findDuel(validCode);
    }
    return () => {
      realtimeStore.leaveRoom();
    };
  }, [validCode]);

  // The hit is one moment: what the lane draws, what the phone plays, and
  // what it does in the hand all come from the same events. The screen stays
  // on for the length of the page.
  useEffect(() => {
    const feedback = startFeedback(
      realtimeStore,
      () => realtimeStore.getMetaSnapshot().clientId
    );
    const release = keepAwake();
    return () => {
      feedback.stop();
      release();
    };
  }, []);

  const me = duel.players.find((player) => player.clientId === meta.clientId);
  const them = duel.players.find((player) => player.clientId !== meta.clientId);
  const { side } = duel;

  const currentZ = useCallback(
    () =>
      meta.clientId === null
        ? 0
        : (realtimeStore.getPosition(meta.clientId)?.z ?? 0),
    [meta.clientId]
  );

  useLaneInput(surface, {
    currentZ,
    // Listening for the whole duel, not only during play: the rules ignore a
    // shot outside play and hold a lane target for when play resumes, and
    // a control that goes dead between rounds feels broken on a phone.
    enabled: side !== null,
    laneHalfHeight: DUEL_FIELD.laneHalfHeight,
    layout,
    maxFireAngle: DUEL_FIELD.maxFireAngle,
    side,
  });

  if (validCode === null) {
    return <InvalidCode />;
  }

  return (
    <main
      className="relative h-[calc(100dvh-4rem)] w-full overflow-hidden"
      data-layout={layout}
      data-model={modelState ?? "pending"}
      data-phase={duel.phase ?? "joining"}
      data-testid="duel-root"
    >
      {side === null ? null : (
        <DuelCanvas
          className="absolute inset-0"
          field={FIELD}
          layout={layout}
          localClientId={meta.clientId}
          models={models}
          onModelState={setModelState}
          palette={palette}
          side={side}
          source={realtimeStore}
        />
      )}

      {/* The whole surface is the control. */}
      <div
        aria-label="Lane"
        className="absolute inset-0 touch-none select-none"
        data-testid="lane"
        ref={surface}
        role="application"
      />

      <Hud me={me} round={duel.round} them={them} />
      <PhaseOverlay
        code={validCode}
        duel={duel}
        layout={layout}
        me={me}
        side={side}
      />
    </main>
  );
};
