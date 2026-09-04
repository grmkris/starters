interface BoundaryRule {
  readonly directory: string;
  readonly forbidden: readonly string[];
}

const rules: readonly BoundaryRule[] = [
  {
    directory: "packages/domain/src",
    forbidden: [
      "react",
      "three",
      "@react-three",
      "koota",
      "@agent-native/ui",
      "@agent-native/protocol",
      "@effect/platform",
      "drizzle-orm",
      "postgres",
      "viem",
      "wagmi",
    ],
  },
  {
    directory: "packages/protocol/src",
    forbidden: [
      "react",
      "three",
      "@react-three",
      "koota",
      "@agent-native/ui",
      "@effect/platform",
      "drizzle-orm",
      "postgres",
      "viem",
      "wagmi",
    ],
  },
  {
    directory: "packages/game-core/src",
    forbidden: [
      "effect",
      "@effect",
      "react",
      "three",
      "@react-three",
      "@agent-native",
      "drizzle-orm",
      "postgres",
      "viem",
      "wagmi",
    ],
  },
  {
    directory: "packages/game-three/src",
    forbidden: [
      "effect",
      "@effect",
      "@agent-native/domain",
      "@agent-native/protocol",
      "@agent-native/chain",
      "@agent-native/database",
      "drizzle-orm",
      "postgres",
      "viem",
      "wagmi",
    ],
  },
];

const importPattern =
  /(?:from\s+|import\s*\()(?<quote>["'])(?<specifier>[^"']+)\k<quote>/gu;

const checkRule = async (rule: BoundaryRule): Promise<string[]> => {
  const glob = new Bun.Glob("**/*.{ts,tsx}");
  const paths: string[] = [];
  for await (const relativePath of glob.scan({
    cwd: rule.directory,
    onlyFiles: true,
  })) {
    paths.push(`${rule.directory}/${relativePath}`);
  }

  const checks = paths.map(async (path): Promise<string[]> => {
    const source = await Bun.file(path).text();
    const violations: string[] = [];
    for (const match of source.matchAll(importPattern)) {
      const specifier = match.groups?.["specifier"];
      if (specifier === undefined) {
        continue;
      }
      const blocked = rule.forbidden.find(
        (prefix) => specifier === prefix || specifier.startsWith(`${prefix}/`)
      );
      if (blocked !== undefined) {
        violations.push(
          `${path}: import '${specifier}' crosses the ${rule.directory} boundary`
        );
      }
    }
    return violations;
  });

  const results = await Promise.all(checks);
  return results.flat();
};

const ruleViolations = await Promise.all(rules.map(checkRule));
const violations = ruleViolations.flat();

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(violation);
  }
  process.exitCode = 1;
} else {
  console.info(`Boundary check passed (${rules.length} package rules)`);
}
