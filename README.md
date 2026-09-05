# FIELD/01

An agent-native Bun monorepo for interactive, realtime, spatial, and Ethereum-capable TypeScript software.

## Run it

```bash
bun install
bun dev
```

Open `http://localhost:3000`. The Bun server listens on `http://localhost:3001`; its health endpoint is `/health` and its WebSocket endpoint is `/realtime`. Open two browser tabs to see two server-owned Koota entities. Move the focused tab with WASD. Reload a tab and it keeps its identity: the server holds a dropped identity for a minute, and the tab presents its claim on the way back in.

The browser talks to the socket on its own origin, and the dev server proxies `/realtime` to the Bun process, so the page works unchanged from another device on the network — open the same URL on a phone and it connects without configuration. Set `WEB_PORT` to run a second worktree alongside the first.

## Verify it

```bash
bun run check
bun run test:contracts
bun run e2e:install # one-time local Chromium install
bun run e2e
```

To see the simulation reproduce itself, record a session and replay it:

```bash
LEDGER_DIR=.ledger bun run dev:server   # play in the browser, then stop the server
bun run --cwd apps/server replay .ledger/rom_<room>-<started>.ndjson
```

Each room writes one file per server run, named by its room id and start time, and the runner takes one file. It rebuilds the room from the ledger using the same `packages/game-core` the server runs, and compares itself to what was recorded at every tick. `docs/decisions/0003-deterministic-replay.md` records why.

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

Read `docs/research/assessment.md` for the deep analysis of the original research and `docs/architecture.md` for the maintained package contract.
