import { Badge } from "@agent-native/ui/components/badge";
import { buttonVariants } from "@agent-native/ui/components/button";
import { cn } from "@agent-native/ui/lib/utils";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";

import { useRealtimeConnection } from "../hooks/use-realtime-connection";
import { WalletControl } from "./wallet-control";

const navClassName = cn(buttonVariants({ size: "sm", variant: "ghost" }));

const RuntimeShell = () => {
  useRealtimeConnection();

  return (
    <div className="scanline min-h-screen pb-[var(--safe-area-inset-bottom)]">
      <header className="bg-background/85 border-b backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-[1600px] items-center gap-2 px-4 pt-[var(--safe-area-inset-top)] sm:gap-5 sm:px-6">
          <Link className="flex min-w-0 items-baseline gap-3" to="/">
            <span className="text-primary font-mono text-xs tracking-[0.24em]">
              FIELD/01
            </span>
            <span className="text-muted-foreground hidden text-sm md:inline">
              agent-native runtime
            </span>
          </Link>
          <nav aria-label="Primary" className="ml-auto flex items-center gap-1">
            <Link
              activeProps={{ "data-status": "active" }}
              className={navClassName}
              to="/"
            >
              Runtime
            </Link>
            <Link
              activeProps={{ "data-status": "active" }}
              className={navClassName}
              to="/architecture"
            >
              Architecture
            </Link>
            <Link
              className={cn(navClassName, "hidden md:inline-flex")}
              to="/dinorace"
            >
              DinoRace
            </Link>
            <Link
              activeProps={{ "data-status": "active" }}
              className={navClassName}
              to="/duel"
            >
              Duel
            </Link>
          </nav>
          <Badge className="hidden sm:inline-flex" variant="outline">
            TS7 · EFFECT 4 RC
          </Badge>
          <WalletControl />
        </div>
      </header>
      <Outlet />
    </div>
  );
};

export const AppShell = () => {
  const immersive = useRouterState({
    select: (state) =>
      ["/dinorace", "/zeleno"].includes(state.location.pathname),
  });
  return immersive ? <Outlet /> : <RuntimeShell />;
};
