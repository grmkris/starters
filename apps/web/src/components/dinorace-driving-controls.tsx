import type {
  DinoRaceInspection,
  DinoRaceQuality,
} from "@agent-native/game-three";
import { Button } from "@agent-native/ui/components/button";

import type { DinoDriveControl, DinoRaceMode } from "../lib/dinorace-replay";

const controls: readonly (readonly [DinoDriveControl, string, string])[] = [
  ["left", "Steer left", "←"],
  ["right", "Steer right", "→"],
  ["brake", "Brake", "BRAKE"],
  ["throttle", "Accelerate", "GAS"],
];
export const DinoRaceDrivingControls = ({
  onControl,
}: {
  readonly onControl: (
    token: string,
    control: DinoDriveControl,
    active: boolean
  ) => void;
}) => (
  <div className="mt-3 flex flex-col gap-2" aria-label="Driving controls">
    <span className="text-muted-foreground hidden text-xs [@media(min-width:1100px)_and_(min-height:600px)]:inline">
      HOLD W / ↑ TO ACCELERATE · S / ↓ BRAKE · A D / ← → STEER
    </span>
    <div className="grid grid-cols-[minmax(56px,72px)_minmax(56px,72px)_1fr_minmax(56px,72px)_minmax(56px,88px)] gap-2">
      {controls.map(([control, label, text]) => (
        <Button
          key={control}
          size="lg"
          variant={control === "throttle" ? "default" : "outline"}
          className="min-h-16 touch-none select-none"
          style={control === "brake" ? { gridColumn: 4 } : undefined}
          onContextMenu={(event) => {
            event.preventDefault();
          }}
          aria-label={label}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            onControl(`pointer-${event.pointerId}`, control, true);
          }}
          onPointerUp={(event) => {
            onControl(`pointer-${event.pointerId}`, control, false);
          }}
          onPointerCancel={(event) => {
            onControl(`pointer-${event.pointerId}`, control, false);
          }}
          onLostPointerCapture={(event) => {
            onControl(`pointer-${event.pointerId}`, control, false);
          }}
          onKeyDown={(event) => {
            if (event.code === "Space" || event.code === "Enter") {
              event.preventDefault();
              onControl(`button-${control}`, control, true);
            }
          }}
          onKeyUp={(event) => {
            if (event.code === "Space" || event.code === "Enter") {
              onControl(`button-${control}`, control, false);
            }
          }}
          onBlur={() => {
            onControl(`button-${control}`, control, false);
          }}
        >
          {text}
        </Button>
      ))}
    </div>
  </div>
);

export const DinoRaceSettings = ({
  mode,
  inspection,
  quality,
  onSwitch,
  onRecover,
  onInspect,
  onQuality,
}: {
  readonly mode: DinoRaceMode;
  readonly inspection: DinoRaceInspection;
  readonly quality: DinoRaceQuality;
  readonly onSwitch: () => void;
  readonly onRecover: () => void;
  readonly onInspect: () => void;
  readonly onQuality: () => void;
}) => (
  <div className="dino-settings">
    <Button size="xs" variant="ghost" onClick={onSwitch}>
      {mode === "drive" ? "WATCH DEMO" : "TAKE WHEEL"}
    </Button>
    {mode === "drive" && (
      <Button
        size="xs"
        variant="ghost"
        onClick={onRecover}
        aria-label="Recover to track"
      >
        RECOVER +3S <kbd>F</kbd>
      </Button>
    )}
    <Button size="xs" variant="ghost" onClick={onInspect}>
      INSPECT: {inspection.toUpperCase()}
    </Button>
    <Button size="xs" variant="ghost" onClick={onQuality}>
      QUALITY: {quality.toUpperCase()}
    </Button>
  </div>
);
