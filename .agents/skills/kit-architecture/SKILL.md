---
name: kit-architecture
description: Preserve this monorepo's package boundaries and choose where new features belong. Use for cross-package features, new workspaces, refactors, or dependency changes.
---

# Kit architecture

Read `docs/architecture.md` and the nearest `AGENTS.md` before editing.

Keep apps as composition roots and libraries focused on stable boundaries. Domain and protocol point inward; adapters point toward them. `game-core` stays host- and renderer-independent. Prefer a small complete feature inside an existing package over a new workspace, service interface, factory, or compatibility layer without a demonstrated second use.

Dependency directions are declared in `tools/graph.ts`; encode a new one there. Record only durable choices in `docs/decisions/`. Run `bun run graph` and the affected type checks after structural changes.
