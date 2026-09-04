---
name: kit-architecture
description: Preserve this monorepo's package boundaries and choose where new features belong. Use for cross-package features, new workspaces, refactors, or dependency changes.
---

# Kit architecture

Read `docs/architecture.md` and the nearest `AGENTS.md` before editing.

Keep apps as composition roots and libraries focused on stable boundaries. Domain and protocol point inward; adapters point toward them. `game-core` stays host- and renderer-independent. Prefer a small complete feature inside an existing package over a new workspace, service interface, factory, or compatibility layer without a demonstrated second use.

When a dependency direction is important, encode it in `tools/check-boundaries.ts`. Record only durable choices in `docs/decisions/`. Run `bun run boundaries` and the affected type checks after structural changes.
