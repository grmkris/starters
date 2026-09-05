import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";

export default defineConfig({
  extends: [core, react, tanstack, antiSlop],
  ignorePatterns: [
    ...core.ignorePatterns,
    "tools/spikes/**",
    ".claude/**",
    ".codex/**",
    ".grok/**",
  ],
  // Package boundaries are declared once in tools/graph.ts. Running them as a
  // lint rule puts them in the editor and in `check:fast`, not only in `check`.
  jsPlugins: ["./tools/oxlint/boundaries.ts"],
  rules: {
    "boundaries/no-cross-boundary-import": "error",
    "eslint/sort-keys": "off",
    "eslint/default-case": "off",
    // Effect Schema's contract idiom declares a value and its type under one
    // name (`const X = Schema...; export type X = typeof X.Type`). That is a
    // deliberate repository-wide pattern, not a local inconvenience, and `tsc`
    // still reports a genuine value/value redeclaration as TS2451.
    "eslint/no-redeclare": "off",
    // With `Schema.TaggedError` and `Context.Service`, `class` is a declaration
    // keyword rather than an OOP design choice, so a per-file limit of 1 is the
    // wrong shape here. 3 keeps a real ceiling.
    "eslint/max-classes-per-file": ["error", 3],
    // False positive against Effect's tagged-error idiom: the rule reads
    // `class E extends Schema.TaggedError<E>()(...)` as a bare `Error` call and
    // demands `new`, where `new` would be a syntax error. It fires on every
    // tagged error in the repository, so this is a systematic mismatch rather
    // than a local exception.
    "unicorn/throw-new-error": "off",
  },
  overrides: [
    {
      // Vendored shadcn CLI output. The generator owns this file's style and
      // will reimpose it on the next `shadcn add`, so matching repository style
      // here would be undone rather than preserved.
      files: ["packages/ui/src/components/**/*.{ts,tsx}"],
      rules: {
        "eslint/func-style": "off",
        "import/consistent-type-specifier-style": "off",
        "react/function-component-definition": "off",
      },
    },
  ],
});
