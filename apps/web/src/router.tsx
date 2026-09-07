import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from "@tanstack/react-router";

import { AppShell } from "./components/app-shell";

const rootRoute = createRootRoute({ component: AppShell });
const indexRoute = createRoute({
  component: lazyRouteComponent(
    async () => await import("./routes/runtime-page"),
    "RuntimePage"
  ),
  getParentRoute: () => rootRoute,
  path: "/",
});
const architectureRoute = createRoute({
  component: lazyRouteComponent(
    async () => await import("./routes/architecture-page"),
    "ArchitecturePage"
  ),
  getParentRoute: () => rootRoute,
  path: "/architecture",
});

const duelRoute = createRoute({
  component: lazyRouteComponent(
    async () => await import("./routes/duel-page"),
    "DuelPage"
  ),
  getParentRoute: () => rootRoute,
  path: "/duel",
});
const duelRoomRoute = createRoute({
  component: lazyRouteComponent(
    async () => await import("./routes/duel-room-page"),
    "DuelRoomPage"
  ),
  getParentRoute: () => rootRoute,
  path: "/duel/$code",
});

const dinoRaceRoute = createRoute({
  component: lazyRouteComponent(
    async () => await import("./routes/dinorace-page"),
    "DinoRacePage"
  ),
  getParentRoute: () => rootRoute,
  path: "/dinorace",
});

const zelenoRoute = createRoute({
  component: lazyRouteComponent(
    async () => await import("./routes/zeleno-page"),
    "ZelenoPage"
  ),
  getParentRoute: () => rootRoute,
  path: "/zeleno",
});

const routeTree = rootRoute.addChildren([
  zelenoRoute,
  dinoRaceRoute,
  indexRoute,
  architectureRoute,
  duelRoute,
  duelRoomRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
