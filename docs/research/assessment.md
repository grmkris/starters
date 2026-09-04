# Research assessment

Reviewed on 2026-09-04 from `docs/research/original-research.md`, the original multi-agent brain dump. The source mixes durable architecture, speculative ecosystem claims, repeated recommendations, install recipes, and mutually exclusive implementation choices. It remains archival input; this document is the maintained decision record.

## Executive conclusion

The valuable result is not a maximal list of fashionable libraries. It is a modular TypeScript runtime whose code, dependency boundaries, modification guidance, and verification rules ship together.

The proposed technologies fit when each has one job: Effect owns typed I/O and resource lifecycles; Effect Schema owns domain and wire validation; Koota owns high-frequency simulation state; R3F/Three owns rendering; shadcn/Base UI owns DOM UI; Foundry owns Solidity; viem and wagmi own server and browser Ethereum access. Apps compose those capabilities without pushing framework concerns back into the core.

That division makes the system useful for ordinary applications now and extensible toward realtime collaboration, simulations, games, workers, replays, and agent controllers later. The repository should therefore optimize for clear seams and replaceable adapters, not for preinstalling every imagined capability.

## Evaluation method

Each proposal in the brain dump was judged against six questions:

1. Does it own a distinct responsibility, or duplicate another tool?
2. Can it remain independent of browser, server, renderer, and persistence hosts?
3. Is its current API mature enough to pin and verify rather than guess?
4. Does it reduce the context an agent must load to make a safe change?
5. Can a deterministic check enforce the intended boundary?
6. Is there a concrete day-one use, or only a possible future use?

This rejects both extremes: a single coupled application is hard for agents to reason about, while dozens of placeholder packages and overlapping skills create more ambiguity than leverage.

## What the research gets right

### Agent-native is an operating model

An `AGENTS.md` file alone does not make a repository agent-native. Agents need short context paths, locally authoritative API guidance, explicit permission boundaries, commands with stable outcomes, and checks that catch drift. This repository combines root and nested instructions, five narrow repository skills, architecture tests, type-aware lint, strict compilation, unit tests, browser tests, and CI.

The human operator can stay at the product level because common implementation decisions are already encoded. The agent still stops for product choices, destructive actions, credentials, deployments, or value-moving transactions.

### Simulation, transport, and rendering run at different rates

The brain dump repeatedly converges on the correct game/realtime model: clients send intent, the server owns truth, a fixed-step simulation advances independently, snapshots cross a validated protocol, and rendering interpolates at display rate. React state must not become a 60 Hz world database.

This is why `game-core` has no React, Three, Effect, browser, or Bun dependency. `game-three` consumes a tiny read-only world source. The server can later move the simulation to a worker, replay process, or distributed room without rewriting its rules.

### Schema belongs at every external boundary

Versioned envelopes and decode-before-use are more important than whether the first transport is raw WebSocket, Effect Socket, RPC, or Colyseus. Effect Schema is sufficient for domain values and wire codecs, so adding Zod or hand-maintained duplicate interfaces would weaken the system.

### Optional infrastructure should remain optional

Ethereum and Postgres are valuable capabilities but are not dependencies of the moving-world demo. Keeping them in isolated packages avoids coupling frame state to persistence or wallet state. The same principle applies to auth, local-first sync, physics, hosted databases, and edge-room providers.

## Conflicts resolved

| Topic | Brain-dump conflict | Repository decision |
| --- | --- | --- |
| Effect | Stable v3 vs greenfield v4 | Exact `4.0.0-rc.112`; installed docs and types are authoritative. Upgrade deliberately. |
| TypeScript | 5.9, TS6, `tsgo`, or TS7 | TypeScript `7.0.2`; `tsc` is canonical, while Oxlint's type-aware pass provides TypeScript-Go diagnostics. |
| Lint/format | Biome vs ESLint/Prettier vs Oxc | One provider: Ultracite policy over Oxlint/Oxfmt, type-aware tsgolint, and anti-slop. |
| Web framework | Vite SPA vs TanStack Start/Next | Vite 8 + TanStack Router. SSR is a later preset if a product actually needs it. |
| Realtime | raw WS, Effect RPC, local-first, Colyseus | A small Effect-schema WebSocket protocol now. Colyseus is reserved for mature game netcode; local-first is a separate capability. |
| State | React, Effect Atom, ECS, or database | React for UI, a focused external store for snapshots, Koota for simulation, Postgres for durable application data. |
| 3D | current WebGL vs WebGPU/TSL | Stable R3F 9 + Three today. WebGPU is an adapter direction, not a day-one runtime requirement. |
| Physics | install Rapier immediately vs defer | Defer until collision or rigid-body behavior exists and deterministic ownership can be specified. |
| Ethereum | Scaffold-ETH shell vs side capability | Foundry + isolated `packages/chain` + wagmi in the existing shell. No second app framework. |
| Agent instructions | dozens of third-party skills | Five narrow repository skills plus installed library docs. Review trust and overlap before adding external guidance. |

## Accepted now

- Bun workspaces with Turborepo orchestration and an exact lockfile.
- Strict TypeScript 7 across packages, repository tools, and browser tests.
- Effect services for configuration, typed failure, retry, acquisition, and release.
- Effect Schema for domain and wire contracts; no second validation language.
- Versioned realtime envelopes and server-authoritative input flow.
- Headless Koota simulation separated from R3F rendering.
- Base UI-backed shadcn components in a shared, source-owned package.
- CSS tokens passed through the app composition root into Three rather than duplicated renderer colors.
- Route-level loading so the spatial runtime is not part of the initial application shell.
- Postgres/Drizzle and Ethereum as prepared, isolated capabilities.
- Root and nested agent instructions, repository skills, boundary checks, Playwright smoke coverage, and CI.

## Intentionally deferred

- Rapier until collision or rigid-body behavior exists.
- Effect HttpApi/OpenAPI until the server has a meaningful HTTP resource beyond health.
- Effect Atom until asynchronous application state needs it; the realtime world uses a purpose-built external store.
- Colyseus, prediction, rollback, lag compensation, matchmaking, and backpressure policy until the networking problem requires them.
- WebGPU/TSL, in-world UI, postprocessing, and an asset pipeline until the visual product direction needs them.
- LiveStore/Zero/Jazz, Durable Objects, Better Auth, and a hosted Postgres provider until a product selects those operational models.
- A shadcn registry distribution layer until at least two reusable capability modules have stabilized.

Deferral is not rejection. Each item has value once a product requirement can define ownership, tests, and operational constraints.

## Rejected as core defaults

- Multiple HTTP frameworks, validators, state stores, linters, or formatters solving the same boundary.
- Next.js or Scaffold-ETH replacing the Vite application shell.
- Database-backed player transforms, React state at frame rate, or client-authoritative shared state.
- A package for every type, constant, helper, or hypothetical adapter.
- Floating RC dependency ranges, remembered production contract addresses, automatic mainnet behavior, or repository-stored secrets.
- Large skill catalogs with overlapping guidance and generic rules that conflict with local architecture.
- Treating Bun's growing set of built-ins as permission to couple domain code to one host runtime.

## Adoption triggers

| Capability | Add it when | Boundary to preserve |
| --- | --- | --- |
| Rapier | Gameplay needs collision, forces, or rigid bodies | Physics steps with simulation; renderer only visualizes results. |
| Colyseus/netcode | Rooms need prediction, reconciliation, matchmaking, or state patches | Domain and simulation remain transport-independent. |
| Effect HttpApi | Real HTTP resources need generated clients/OpenAPI | HTTP schemas compose from domain contracts. |
| Local-first data | Offline edits and conflict resolution are product requirements | Do not reuse the simulation channel as document sync. |
| WebGPU/TSL | A measured visual/compute feature needs it | Keep renderer choice behind `game-three`. |
| Auth/database host | A product chooses identity and deployment models | Keep provider SDKs in adapters and configuration layers. |
| shadcn registry | Multiple repositories consume stable capability modules | Registry packages source plus instructions, never hidden runtime behavior. |

## Risks and upgrade policy

Effect 4 is pre-GA, so exact pins and installed-version guidance are mandatory. Type-aware Oxlint follows TypeScript-Go compatibility and must move with TS7. Three/R3F versions should move together; the current pairing emits an upstream `THREE.Clock` deprecation warning but no application errors. Bun WebSocket close, refresh, backpressure, and production proxy behavior need deeper integration coverage before production claims. Ethereum automation must distinguish local/testnet enablement from permission to deploy or move value.

For upgrades, change one ownership domain at a time, read that installed version's documentation, run the full deterministic and browser gates, inspect the production chunk graph, and record only durable architectural consequences.

## Primary references

- [Bun 1.4 release](https://bun.com/blog/bun-v1.4)
- [TypeScript](https://www.typescriptlang.org/)
- [Oxc type-aware linting](https://oxc.rs/docs/guide/usage/linter/type-aware)
- [Vite 8 announcement](https://vite.dev/blog/announcing-vite8)
- [shadcn monorepo guidance](https://ui.shadcn.com/docs/monorepo)
- [shadcn Base UI default](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default)
- [Playwright installation and test model](https://playwright.dev/docs/intro)
- [Foundry documentation](https://book.getfoundry.sh/)
