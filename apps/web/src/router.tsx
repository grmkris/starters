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

const routeTree = rootRoute.addChildren([indexRoute, architectureRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
