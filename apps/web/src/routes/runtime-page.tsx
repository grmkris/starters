import { LOBBY_ROOM_ID } from "@agent-native/domain";
import type { ClientId } from "@agent-native/domain";
import { defaultWorldFeel, WorldCanvas } from "@agent-native/game-three";
import type { WorldFeel } from "@agent-native/game-three";
import { Badge } from "@agent-native/ui/components/badge";
import { Button } from "@agent-native/ui/components/button";
import { Separator } from "@agent-native/ui/components/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@agent-native/ui/components/tooltip";
import { cn } from "@agent-native/ui/lib/utils";
import { Effect, Fiber } from "effect";
import { ActivityIcon, RadioTowerIcon, SendIcon } from "lucide-react";
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { Thumbstick } from "../components/thumbstick";
import { useMovementInput } from "../hooks/use-movement-input";
import { realtimeProgram } from "../lib/realtime-client";
import { realtimeStore } from "../lib/realtime-store";
import { readScenePalette } from "../lib/scene-palette";
import { realtimeUrl } from "../lib/socket-url";

/**
 * `import.meta.env.DEV` is replaced with a literal at build time, so the whole
 * branch - and with it dialkit and motion - is eliminated from a production
 * bundle rather than merely never rendered.
 */
const DevDials = import.meta.env.DEV
  ? lazy(async () => {
      const module = await import("../components/dev-dials");
      return { default: module.DevDials };
    })
  : null;

const formatClientId = (clientId: ClientId | null): string =>
  clientId === null ? "awaiting" : clientId.slice(0, 8);

export const RuntimePage = () => {
  const palette = useMemo(() => readScenePalette(), []);
  const [feel, setFeel] = useState<WorldFeel>(defaultWorldFeel);
  const meta = useSyncExternalStore(
    realtimeStore.subscribeMeta,
    realtimeStore.getMetaSnapshot,
    realtimeStore.getMetaSnapshot
  );

  useEffect(() => {
    realtimeStore.joinRoom(LOBBY_ROOM_ID);
    const fiber = Effect.runFork(realtimeProgram(realtimeStore, realtimeUrl()));
    return () => {
      Effect.runFork(Fiber.interrupt(fiber));
    };
  }, []);

  useMovementInput(meta.status);

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
            feel={feel}
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
            <span className="pointer-coarse:hidden">
              WASD TO TRANSMIT INPUT · DRAG TO ORBIT
            </span>
            <span className="hidden pointer-coarse:inline">
              STICK TO TRANSMIT INPUT · DRAG TO ORBIT
            </span>
          </div>
          <div className="pointer-events-none absolute right-4 bottom-4">
            <Thumbstick />
          </div>
          {DevDials === null ? null : (
            <Suspense fallback={null}>
              <DevDials onChange={setFeel} />
            </Suspense>
          )}
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
              <dd
                className="mt-1 font-mono"
                data-client-id={meta.clientId ?? ""}
                data-testid="client-id"
              >
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
            <div className="col-span-2">
              <dt className="text-muted-foreground font-mono text-[0.65rem] tracking-wider">
                LAST FAULT
              </dt>
              <dd
                className={cn(
                  "mt-1 font-mono text-xs wrap-anywhere",
                  meta.lastError === null
                    ? "text-muted-foreground"
                    : "text-destructive"
                )}
                data-testid="last-fault"
              >
                {meta.lastError ?? "—"}
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
