import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    "docs/research/original-research.md",
    // Blender owns this generated fixture format; domain tests validate its contents.
    "apps/web/public/dinorace-assets/manifest.json",
    // Matches the exclusions in oxlint.config.ts and knip.json: one-off probes,
    // deliberately outside `bun run check`. See tools/spikes/README.md.
    "tools/spikes/**",
    // Written by the Invok platform tooling and tracked as generated: the
    // generator owns their style, as with the shadcn output.
    ".claude/**",
    ".codex/**",
    ".grok/**",
  ],
});
