import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";

export default defineConfig({
  extends: [core, react, tanstack, antiSlop],
  ignorePatterns: core.ignorePatterns,
  rules: {
    "eslint/sort-keys": "off",
    "eslint/default-case": "off",
  },
  overrides: [
    {
      files: ["packages/ui/src/components/**/*.{ts,tsx}"],
      rules: {
        "eslint/func-style": "off",
        "import/consistent-type-specifier-style": "off",
        "react/function-component-definition": "off",
      },
    },
    {
      files: [
        "packages/domain/src/**/*.ts",
        "packages/protocol/src/**/*.ts",
        "packages/chain/src/**/*.ts",
      ],
      rules: {
        "eslint/no-redeclare": "off",
      },
    },
    {
      files: [
        "packages/domain/src/**/*.ts",
        "packages/chain/src/**/*.ts",
        "packages/database/src/**/*.ts",
        "apps/web/src/lib/realtime-client.ts",
      ],
      rules: {
        "unicorn/throw-new-error": "off",
      },
    },
    {
      files: ["packages/chain/src/index.ts", "packages/database/src/index.ts"],
      rules: {
        "eslint/max-classes-per-file": "off",
      },
    },
  ],
});
