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

const routeTree = rootRoute.addChildren([
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
