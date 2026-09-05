---
name: invok-platform
description: >
  Invok workspace platform — activate when the user asks about workspace layout,
  panels, reports, boards, crons, webhooks, integrations, or any Invok platform feature.
  Also activate when orchestrating multi-panel views or automating tasks.
---

## Invok Platform

You are running inside Invok, a workspace orchestration platform with MCP tools
for managing panels, reports, boards, sessions, git, and automation.

## Reports

Write to `.invok/reports/<filename>.mdx` (or `.md`) — appears in the Reports panel.
Prefer `.mdx` for structured output. The `invok-artifacts` skill has the full
MDX component reference (Chart, DataTable, KPICard, ActionButton, etc.).

## Drawing Boards

For diagrams the user should edit (architecture sketches, flows, whiteboards,
annotated screenshots), create a drawing board instead of a static Mermaid
diagram. Boards are `.board.json` files in `.invok/boards/`:

- `boards_create` — whole board in one call. Elements: rect/ellipse
  (x,y,w,h + optional label), arrow (x1,y1 → x2,y2), line (points), text,
  image (src = project-root-relative path). Named colors only
  (fg/muted/primary/red/green/amber/blue) — they follow the user's theme.
- `boards_apply` — create/update/delete ops on an existing board.
- `boards_read` — inspect a board; start with `view: "outline"`.

`projectId` comes from `projects_list`.

## Workspace Orchestration

Use `workspace_syncLayout` to change which panels are open (one layout per project, keyed by projectId).
Panels are an ordered list rendered as tabs of one group in array order; it replaces the
user's saved arrangement, so only call it when asked to change the workspace.
To show the user one file, report or board, emit a deep link (below) instead.
Panel types include `chat`, `report`, `board`, `file_content`, `git_diff`, `email`.

Example: chat tab plus report tab:
```json
{
  "panels": [
    { "panelType": "chat" },
    { "panelType": "report" }
  ]
}
```

## Automation

- **Crons**: Schedule recurring prompts (cron expression). Good for monitoring, reports.
- **Webhooks**: POST endpoint that triggers a prompt. Good for CI/CD events, service hooks.

## Integrations

Use `integrations_listIntegrations` to see connected services (GitHub, Linear,
Slack, etc.) and `integrations_executeTool` to call their actions.

## From the shell

Every tool above is also reachable through the `invok` CLI, so you can use
one you were not given as a tool without any MCP roster in your prompt:

- `invok call` lists them; `invok call --q board` searches name + description
- `invok call <tool> --schema` prints the arguments
- `invok call boards_create projectId=prj_… name=Sketch` runs one
- `--json '{…}'`, `--json @file` and `--json -` pass a whole payload; dotted
  keys nest (`page.limit=20`)

It answers with JSON on stdout and exits non-zero when the tool errors.

## Deep links (same machine)

This project in Invok: https://inv-30ba545239.cloud.invok.run/projects/prj_01m1s4d2a3fj6b6nh8r3gask19

When you mention a file the human might want to open, emit a markdown
link — do not dump a bare path. Paths are repo-relative; add `#L<line>`
or `#L<start>-<end>` to land on a line:

  [`src/foo.ts:42`](https://inv-30ba545239.cloud.invok.run/projects/prj_01m1s4d2a3fj6b6nh8r3gask19?file=src/foo.ts#L42)

Reports: https://inv-30ba545239.cloud.invok.run/projects/prj_01m1s4d2a3fj6b6nh8r3gask19?report=<slug>
Boards:  https://inv-30ba545239.cloud.invok.run/projects/prj_01m1s4d2a3fj6b6nh8r3gask19?board=<slug>
Chat:    https://inv-30ba545239.cloud.invok.run/projects/prj_01m1s4d2a3fj6b6nh8r3gask19/c/<sdkSessionId>
Message: https://inv-30ba545239.cloud.invok.run/projects/prj_01m1s4d2a3fj6b6nh8r3gask19/c/<sdkSessionId>?m=<uuid>
         (the `uuid` on a sessions_search hit — opens on that message)

Prefer these links over `workspace_syncLayout` — that replaces the user's
whole panel arrangement; a link lets them click. From a shell,
`invok url <path> [--line N]` prints the same URL.

## Project

**Type**: node

**Runnable tasks** — detected from this project's own manifests.
Run them exactly as written; the runner is the one this project uses.

- `bun run dev` — turbo run dev --parallel
- `bun run build` — turbo run build
- `bun run test` — turbo run test --filter=!@agent-native/contracts
- `bun run lint` — oxlint .
- `bun run typecheck` — turbo run typecheck --filter=!@agent-native/contracts && tsc --noEmit -p tools/t
- `bun run check` — bun run format:check && bun run lint:types && bun run typecheck && bun run graph
- `bun run format` — oxfmt --write
- `bun run e2e` — playwright test
- `bun run dev:web` — turbo run dev --filter=@agent-native/web
- `bun run dev:server` — turbo run dev --filter=@agent-native/server
- `bun run e2e:install` — playwright install chromium
- `bun run build:apps` — turbo run build --filter=!@agent-native/contracts
- `bun run check:fast` — bun run format:check && bun run lint && bun run typecheck
- `bun run format:check` — oxfmt --check
- `bun run lint:types` — oxlint --type-aware --report-unused-disable-directives .
- `bun run test:contracts` — forge test --root packages/contracts
- `bun run knip` — knip
- `bun run graph` — bun tools/check-graph.ts
- `bun run icons` — bun tools/icons.ts
- `bun run agents:check` — bun tools/check-agent-files.ts
- `bun run hooks:install` — lefthook install
- `bun run fix` — ultracite fix
