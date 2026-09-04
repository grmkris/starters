# FIELD/01

An agent-native Bun monorepo for interactive, realtime, spatial, and Ethereum-capable TypeScript software.

## Run it

```bash
bun install
bun dev
```

Open `http://localhost:3000`. The Bun server listens on `http://localhost:3001`; its health endpoint is `/health` and its WebSocket endpoint is `/realtime`. Open two browser tabs to see two server-owned Koota entities. Move the focused tab with WASD.

## Verify it

```bash
bun run check
bun run test:contracts
bun run e2e:install # one-time local Chromium install
bun run e2e
```

`check` runs Oxfmt, type-aware Oxlint/anti-slop, strict TypeScript, architecture boundaries, agent-skill validation, Bun tests, and Knip. Foundry and Playwright remain explicit gates because they own separate native toolchains. CI runs all three layers on every pull request and main-branch push.

## Repository map

- `apps/web` — Vite, React 19, TanStack Router, wagmi, realtime browser adapter.
- `apps/server` — Bun HTTP/WebSocket process with an Effect-owned lifecycle.
- `packages/domain` — Effect Schema domain values and errors.
- `packages/protocol` — versioned realtime codecs.
- `packages/game-core` — headless Koota simulation.
- `packages/game-three` — Three/R3F renderer and interpolation.
- `packages/ui` — shadcn/Base UI source components and Tailwind tokens.
- `packages/chain` — viem inside Effect services and address validation.
- `packages/database` — scoped Postgres service and Drizzle schema.
- `packages/contracts` — Foundry contracts and tests.
- `.agents/skills` — five narrow, repository-specific decision guides.
- `e2e` — Chromium smoke coverage for runtime, routes, console errors, and compact layout.

Read `docs/research-assessment.md` for the deep analysis of the original research and `docs/architecture.md` for the maintained package contract.
