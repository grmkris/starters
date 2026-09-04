# Agent operating contract

This repository is written by coding agents for a human operator who observes, tests, and gives product direction. Treat implementation requests as permission to complete the local, reversible work required by the request. Ask only when a missing choice changes the product or requires an external/destructive action.

## Start here

1. Read `docs/architecture.md` before changing package boundaries.
2. Read the nearest nested `AGENTS.md` for the area you touch.
3. Load the matching repository skill from `.agents/skills/` for architecture, realtime, game, onchain, or verification work.
4. Use the installed library documentation and types as the API source of truth. Effect 4 is pinned to an RC, so read `node_modules/effect/AGENTS.md` before Effect work.

User instructions override repository skills. Skills inform implementation; they do not expand authorization.

## Toolchain

- Runtime and package manager: Bun. Use `bun` and `bunx --bun`, never npm/pnpm/yarn for project operations.
- TypeScript: strict TS7. Bun transpiles but does not replace type checking.
- Format/lint policy: Ultracite using Oxfmt + Oxlint + type-aware tsgolint + anti-slop.
- Tests: `bun test`; browser flows: Playwright; Solidity: Foundry.
- Run `bun run check:fast` during work and `bun run check` before declaring completion. Run `bun run e2e` for visible or browser-facing changes.
- Do not install Git hooks automatically. This directory may be nested in another repository; `bun run hooks:install` is explicit opt-in.

## Dependency direction

- `packages/domain`: Schema-backed values and errors. No UI, runtime, database, or transport imports.
- `packages/protocol`: versioned wire schemas. It may depend only on domain and Effect.
- `packages/game-core`: headless Koota simulation. It must not import Effect, React, Three, browser APIs, or server APIs.
- `packages/game-three`: renderer adapter over a narrow world-source contract. It may depend on React and Three; it must not own authoritative state.
- `packages/ui`: source-owned shadcn/Base UI components and tokens. It contains no product or game behavior.
- `packages/chain`: viem behind Schema/Effect boundaries. It contains no React wallet hooks.
- `packages/database`: Drizzle/Postgres behind a scoped Effect service.
- `apps/server`: Bun process and Effect lifecycle; it owns authoritative rooms.
- `apps/web`: composition root for React, TanStack Router, transport adapters, and wagmi.

`bun run boundaries` enforces the critical import rules. Do not weaken a global rule to resolve one local inconvenience.

## Runtime invariants

- Effect owns I/O, configuration, failures, retries, resources, and service lifecycles.
- Effect Schema is the application contract language. Do not add Zod for domain, HTTP, realtime, config, or chain boundaries.
- Every wire message has an explicit version and is decoded before use.
- Entity identifiers are TypeIDs declared in `packages/domain/src/id.ts`. Add an entity by adding one `makeIdSchema` pair there; never introduce a bare `string` id or a second prefix registry.
- Clients send input/intents; the server owns shared simulation state.
- Simulation uses a fixed timestep. Rendering interpolates independently.
- React state is for application UI, not per-frame transforms.
- Never call `Effect.gen`, network APIs, or React state setters inside `useFrame`.
- Avoid `as any`, double assertions, `@ts-ignore`, invented compatibility paths, speculative abstractions, and file-per-concept explosions.

## UI

- Inspect `components.json`, then use the shadcn CLI for shared components.
- shadcn/Base UI owns DOM controls and overlays. R3F owns the scene. In-world UI is a later, separate capability.
- Use semantic tokens from `packages/ui/src/styles/globals.css`. Keep accessible names, focus states, reduced-motion behavior, and responsive layouts.
- A visible change is incomplete until the app boots, browser errors are checked, and the changed interaction is exercised.

## Onchain

- Read the live router at `https://ethskills.com/SKILL.md` before Solidity, deployment, protocol-address, gas, or security work. Its purpose is to correct stale model knowledge.
- Foundry owns `packages/contracts`; viem owns non-React chain access; wagmi owns browser wallet state.
- Never invent or remember production addresses. Resolve them from a verified primary source and validate them in `packages/chain`.
- Never put user private keys in the browser or repository. Server signers must use redacted configuration.
- Local Anvil and public testnets are the default. Deployment, mainnet transactions, and anything holding user funds require explicit user direction and stronger review.

## Change discipline

- Preserve user changes and keep edits inside the requested scope.
- Prefer the smallest complete vertical slice over placeholder packages or unused infrastructure.
- Record durable architectural decisions in `docs/decisions/`; do not turn temporary implementation details into permanent rules.
- Public package entrypoints may re-export their supported surface. Avoid unrelated barrel layers inside packages.
- Comments explain non-obvious constraints or tradeoffs, not the code line beneath them.
