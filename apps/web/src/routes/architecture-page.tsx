import { Badge } from "@agent-native/ui/components/badge";
import { Separator } from "@agent-native/ui/components/separator";

const layers = [
  ["apps/web", "React shell, route composition, wallet and transport adapters"],
  ["apps/server", "Bun process, Effect lifecycle, authoritative simulation"],
  ["packages/domain", "Schema-backed values and typed errors"],
  ["packages/protocol", "Versioned realtime wire contracts"],
  ["packages/game-core", "Headless Koota simulation with a fixed timestep"],
  ["packages/game-three", "R3F renderer and interpolation adapter"],
  ["packages/chain", "Viem behind Effect services and validated addresses"],
  ["packages/database", "Postgres/Drizzle capability behind a scoped service"],
] as const;

export const ArchitecturePage = () => (
  <main className="mx-auto max-w-6xl p-4 sm:p-6">
    <div className="signal-in grid gap-8 py-8 lg:grid-cols-[0.7fr_1.3fr] lg:py-16">
      <div>
        <Badge variant="outline">DEPENDENCY DIRECTION</Badge>
        <h1 className="mt-4 text-5xl leading-[0.92] font-semibold tracking-[-0.05em]">
          Small surfaces. Hard borders.
        </h1>
        <p className="text-muted-foreground mt-5 max-w-md text-sm leading-6">
          The repository is arranged so an agent can inspect one boundary
          without loading the entire system. Automated checks reject imports
          that collapse these layers.
        </p>
      </div>
      <section
        aria-labelledby="package-map-title"
        className="bg-card/30 border"
      >
        <h2 id="package-map-title" className="sr-only">
          Package map
        </h2>
        {layers.map(([name, responsibility], index) => (
          <div key={name}>
            {index > 0 && <Separator />}
            <div className="grid gap-2 p-4 sm:grid-cols-[12rem_1fr] sm:p-5">
              <code className="text-primary font-mono text-xs">{name}</code>
              <p className="text-muted-foreground text-sm">{responsibility}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  </main>
);
