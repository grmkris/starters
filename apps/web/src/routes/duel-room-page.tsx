import { DUEL_FIELD, RoomCode } from "@agent-native/domain";
import type { DuelPlayerSnapshot, Side } from "@agent-native/domain";
import { DuelCanvas } from "@agent-native/game-three";
import type { ModelState } from "@agent-native/game-three";
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
 * Where the models live. `?models=off` keeps the procedural bodies, which is
 * how the two are compared and how the fallback path is tested.
 */
const MODELS = { player: "/models/player.glb" };

const modelsWanted = (): boolean =>
  new URLSearchParams(window.location.search).get("models") !== "off";

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
  readonly me: DuelPlayerSnapshot | undefined;
  readonly side: Side | null;
}

/** What sits over the lane in each phase. Nothing during play. */
const PhaseOverlay = ({ code, duel, me, side }: PhaseOverlayProps) => {
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
            {side === -1
              ? "THE SEAM IS TO YOUR RIGHT"
              : "THE SEAM IS TO YOUR LEFT"}
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
  const [modelState, setModelState] = useState<ModelState | null>(null);
  const models = useMemo(() => (modelsWanted() ? MODELS : undefined), []);

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
    enabled: duel.phase === "playing",
    laneHalfHeight: DUEL_FIELD.laneHalfHeight,
    maxFireAngle: DUEL_FIELD.maxFireAngle,
    side,
  });

  if (validCode === null) {
    return <InvalidCode />;
  }

  return (
    <main
      className="relative h-[calc(100dvh-4rem)] w-full overflow-hidden"
      data-model={modelState ?? "pending"}
      data-phase={duel.phase ?? "joining"}
      data-testid="duel-root"
    >
      {side === null ? null : (
        <DuelCanvas
          className="absolute inset-0"
          field={FIELD}
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
      <PhaseOverlay code={validCode} duel={duel} me={me} side={side} />

      {/* Two phones side by side are two portrait screens. iOS cannot be asked
          to lock, so it is told instead; Android installs lock via the manifest. */}
      <div
        className="bg-background absolute inset-0 hidden flex-col items-center justify-center gap-3 p-8 text-center pointer-coarse:landscape:flex"
        data-testid="duel-turn-phone"
      >
        <p className="text-4xl font-semibold tracking-[-0.04em]">
          Turn your phone upright
        </p>
        <p className="text-muted-foreground max-w-xs text-sm">
          The lane is tall. Two phones side by side make the field.
        </p>
      </div>
    </main>
  );
};
