import { WorldCanvas } from "@agent-native/game-three";
import { Badge } from "@agent-native/ui/components/badge";
import { Button } from "@agent-native/ui/components/button";
import { Separator } from "@agent-native/ui/components/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@agent-native/ui/components/tooltip";
import { Effect, Fiber } from "effect";
import { ActivityIcon, RadioTowerIcon, SendIcon } from "lucide-react";
import { useEffect, useMemo, useSyncExternalStore } from "react";

import { realtimeProgram } from "../lib/realtime-client";
import { realtimeStore } from "../lib/realtime-store";
import { readScenePalette } from "../lib/scene-palette";

const websocketUrl =
  import.meta.env.VITE_WS_URL ?? "ws://localhost:3001/realtime";

const useMovementInput = (): void => {
  useEffect(() => {
    const pressed = new Set<string>();
    const onKeyDown = (event: KeyboardEvent): void => {
      pressed.add(event.key.toLowerCase());
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      pressed.delete(event.key.toLowerCase());
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const interval = window.setInterval(() => {
      realtimeStore.sendInput({
        x: Number(pressed.has("d")) - Number(pressed.has("a")),
        z: Number(pressed.has("s")) - Number(pressed.has("w")),
      });
    }, 50);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.clearInterval(interval);
    };
  }, []);
};

const formatClientId = (clientId: string | null): string =>
  clientId === null ? "awaiting" : clientId.slice(0, 8);

export const RuntimePage = () => {
  const palette = useMemo(() => readScenePalette(), []);
  const meta = useSyncExternalStore(
    realtimeStore.subscribeMeta,
    realtimeStore.getMetaSnapshot,
    realtimeStore.getMetaSnapshot
  );

  useEffect(() => {
    const fiber = Effect.runFork(realtimeProgram(realtimeStore, websocketUrl));
    return () => {
      Effect.runFork(Fiber.interrupt(fiber));
    };
  }, []);

  useMovementInput();

  return (
    <main className="mx-auto max-w-[1600px] p-4 sm:p-6">
      <div className="signal-in mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <p className="text-primary font-mono text-xs tracking-[0.22em]">
            LIVE SYSTEM / AUTHORITATIVE ROOM
          </p>
          <h1 className="mt-3 max-w-4xl text-4xl leading-[0.94] font-semibold tracking-[-0.05em] sm:text-6xl">
            A runtime for software that refuses to sit still.
          </h1>
        </div>
        <p className="text-muted-foreground self-end text-sm leading-6">
          Effect owns the edges. Koota advances the world. React and Three
          render the result. Every boundary is visible to the next agent.
        </p>
      </div>

      <div className="bg-card/30 grid overflow-hidden border lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section
          aria-label="Realtime world"
          className="relative min-h-[34rem] overflow-hidden"
        >
          <WorldCanvas
            className="absolute inset-0"
            localClientId={meta.clientId}
            palette={palette}
            source={realtimeStore}
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
            <Badge variant="secondary">
              <RadioTowerIcon data-icon="inline-start" />
              {meta.status.toUpperCase()}
            </Badge>
            <div className="text-muted-foreground text-right font-mono text-[0.65rem] leading-5">
              <p>ROOM / LOBBY</p>
              <p>TICK / {meta.tick.toString().padStart(6, "0")}</p>
            </div>
          </div>
          <div className="text-muted-foreground pointer-events-none absolute bottom-4 left-4 font-mono text-[0.65rem] tracking-[0.18em]">
            WASD TO TRANSMIT INPUT · DRAG TO ORBIT
          </div>
        </section>

        <aside className="bg-background/80 flex flex-col border-t p-5 lg:border-t-0 lg:border-l">
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground font-mono text-xs tracking-[0.18em]">
              SIGNAL INSPECTOR
            </p>
            <ActivityIcon className="text-primary" />
          </div>
          <Separator className="my-5" />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-6 text-sm">
            <div>
              <dt className="text-muted-foreground font-mono text-[0.65rem] tracking-wider">
                CLIENT
              </dt>
              <dd className="mt-1 font-mono">
                {formatClientId(meta.clientId)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground font-mono text-[0.65rem] tracking-wider">
                PRESENCE
              </dt>
              <dd className="mt-1 font-mono">{meta.connected}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground font-mono text-[0.65rem] tracking-wider">
                SIMULATION
              </dt>
              <dd className="mt-1 font-mono">{meta.tickRate} HZ</dd>
            </div>
            <div>
              <dt className="text-muted-foreground font-mono text-[0.65rem] tracking-wider">
                ROUND TRIP
              </dt>
              <dd className="mt-1 font-mono">
                {meta.latencyMs === null ? "—" : `${meta.latencyMs} ms`}
              </dd>
            </div>
          </dl>
          <Separator className="my-5" />
          <div className="text-muted-foreground flex flex-col gap-3 text-sm">
            <p>Open a second tab to spawn another server-owned entity.</p>
            <p>
              Snapshots arrive at 20 Hz. Rendering interpolates independently.
            </p>
          </div>
          <div className="mt-auto pt-8">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    className="w-full"
                    disabled={meta.status !== "live"}
                    onClick={() => {
                      realtimeStore.ping();
                    }}
                    variant="outline"
                  />
                }
              >
                <SendIcon data-icon="inline-start" />
                Send diagnostic pulse
              </TooltipTrigger>
              <TooltipContent>Measure the WebSocket round trip.</TooltipContent>
            </Tooltip>
          </div>
        </aside>
      </div>
    </main>
  );
};
