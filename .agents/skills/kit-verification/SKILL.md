---
name: kit-verification
description: Verify completed repository changes with risk-appropriate static checks, tests, runtime probes, browser interaction, or Foundry gates before reporting success.
---

# Kit verification

During implementation, use `bun run check:fast`. Before completion, run `bun run check` unless the change cannot affect code or instructions. Fix causes rather than weakening repository-wide rules.

For UI, boot the relevant app, check browser/runtime errors, exercise the changed interaction, and inspect the rendered result at desktop and narrow widths. For realtime, test connection, refresh, disconnect, invalid messages, and a second client when affected. For contracts, run `bun run test:contracts`; use fuzz, invariant, fork, security, or audit passes according to the value at risk.

A test that has never failed proves nothing, so run a new test against the unpatched code first and report that it failed there. Report the exact checks that passed and any gate that could not run. Do not infer success from compilation alone.
