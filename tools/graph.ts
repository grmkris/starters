/**
 * The single architectural declaration for this repository.
 *
 * Every dependency rule is stated here once. `tools/oxlint/boundaries.ts` turns
 * these entries into lint diagnostics that fire in the editor and in
 * `bun run check:fast`, so a boundary violation is visible while it is being
 * written rather than at the end of a session.
 *
 * If a rule is not in this file, it is not a rule.
 */

/** Where a workspace sits in the dependency order. */
type Layer = "app" | "contract" | "engine" | "view" | "adapter" | "foreign";

export interface Node {
  /** Workspace directory, relative to the repository root. */
  readonly dir: string;
  /** Package name, or null for workspaces that are not TypeScript. */
  readonly name: string | null;
  readonly layer: Layer;
  /** One sentence. Describes what this workspace owns. */
  readonly role: string;
  /** Workspace packages this one may import. Empty means leaf. */
  readonly mayImport: readonly string[];
  /**
   * External packages this workspace may import, matched on the package prefix
   * so subpaths such as `viem/chains` resolve to `viem`.
   *
   * This is an allowlist, not a denylist: a package absent from the list is
   * forbidden. A denylist can only forbid what somebody already thought of,
   * which is the wrong shape for a rule meant to constrain an agent that is
   * inventing new dependencies.
   *
   * Omit the field entirely to mean unrestricted. Only composition roots, which
   * legitimately reach for anything, should omit it.
   */
  readonly mayUse?: readonly string[];
  /**
   * Required when a workspace is unreachable from any app, and forbidden when
   * it is reachable, so a seam cannot quietly outlive the reason it was kept.
   */
  readonly seam?: {
    readonly consumer: string;
    readonly reason: string;
  };
}

/** Module specifiers every workspace may use, regardless of its allowlist. */
export const alwaysAllowed: readonly string[] = ["bun", "bun:test"];

export const nodes: readonly Node[] = [
  {
    dir: "apps/web",
    name: "@agent-native/web",
    layer: "app",
    role: "Composition root for React, TanStack Router, transport adapters, and wagmi.",
    mayImport: [
      "@agent-native/domain",
      "@agent-native/game-three",
      "@agent-native/protocol",
      "@agent-native/ui",
    ],
  },
  {
    dir: "apps/server",
    name: "@agent-native/server",
    layer: "app",
    role: "Bun process and Effect lifecycle; owns the authoritative simulation.",
    mayImport: [
      "@agent-native/domain",
      "@agent-native/game-core",
      "@agent-native/protocol",
    ],
  },
  {
    dir: "packages/domain",
    name: "@agent-native/domain",
    layer: "contract",
    role: "Schema-backed domain values, identifiers, and errors. No UI, transport, or persistence.",
    mayImport: [],
    mayUse: ["effect", "typeid-js"],
  },
  {
    dir: "packages/protocol",
    name: "@agent-native/protocol",
    layer: "contract",
    role: "Versioned wire schemas; every message carries an explicit `v`.",
    mayImport: ["@agent-native/domain"],
    mayUse: ["effect"],
  },
  {
    dir: "packages/game-core",
    name: "@agent-native/game-core",
    layer: "engine",
    role: "Headless deterministic Koota simulation advancing on a fixed timestep.",
    mayImport: [],
    mayUse: ["koota"],
  },
  {
    dir: "packages/game-three",
    name: "@agent-native/game-three",
    layer: "view",
    role: "Renderer adapter over a narrow world-source contract. Owns no authoritative state.",
    mayImport: [],
    mayUse: ["@react-three/drei", "@react-three/fiber", "react", "three"],
  },
  {
    dir: "packages/ui",
    name: "@agent-native/ui",
    layer: "view",
    role: "Source-owned shadcn/Base UI components and tokens. No product or game behavior.",
    mayImport: [],
    mayUse: [
      "@base-ui/react",
      "class-variance-authority",
      "cn",
      "react",
      "react-dom",
    ],
  },
  {
    dir: "packages/chain",
    name: "@agent-native/chain",
    layer: "adapter",
    role: "viem behind Schema and Effect boundaries. No React wallet hooks.",
    mayImport: [],
    mayUse: ["effect", "viem"],
    seam: {
      consumer: "apps/web",
      reason:
        "browser chain adapter, unwired until a slice needs onchain reads",
    },
  },
  {
    dir: "packages/database",
    name: "@agent-native/database",
    layer: "adapter",
    role: "Drizzle and Postgres behind a scoped Effect service.",
    mayImport: ["@agent-native/domain"],
    mayUse: ["drizzle-kit", "drizzle-orm", "effect", "postgres"],
    seam: {
      consumer: "apps/server",
      reason: "persistence adapter, unwired until rooms outlive a process",
    },
  },
  {
    dir: "packages/contracts",
    name: null,
    layer: "foreign",
    role: "Foundry contracts and tests. Solidity toolchain, not TypeScript.",
    mayImport: [],
    seam: { consumer: "packages/chain", reason: "generated ABI boundary" },
  },
];
