# 0003 — Deterministic room replay

Status: accepted on 2026-09-04.

The authoritative loop records an append-only ndjson ledger of what it consumed, and `apps/server/src/replay.ts` rebuilds the room from that ledger and compares itself to what was recorded at every tick. `docs/architecture.md` already claimed `game-core` could run in "a replay runner"; this makes the claim checkable instead of leaving it resting on the absence of an import. The runner imports the simulation unchanged, because a replay carrying its own copy of the rules would agree with the server without proving anything about it.

Determinism was blocked by the server, not the simulation. `game-core` and koota contain no clock and no randomness, and `step` takes its timestep as a parameter, so the arithmetic was already reproducible. What was not reproducible was the input sequence: `applyInput` ran straight from the websocket message handler, so whether a message landed before or after a given step depended on jitter, and two messages inside one tick window meant the first was overwritten and never observed. Intent is now buffered and drained at the boundary, which does not stop input being superseded but makes the loss a property of the recorded frame rather than of scheduling.

Two supporting changes were prerequisites rather than parts of the feature. `snapshot()` returns players in a canonical order, because map iteration recorded arrival and a reconnect silently reordered the world. The tick loop carries an accumulator, because a bare `setInterval` stepped once per firing however late that firing was, so simulated time quietly ran slow under load.

Session opens and closes carry no tick. File order is the record: a spawn offset is derived from how many players were present at the join, so replaying events in the order they were written reproduces it without reconstructing a clock. The format has its own version rather than reusing `ProtocolVersion`, which is a hard decode failure by design and describes what two live processes agree to speak, not what a file written last week should still parse as.

Recording is off unless `LEDGER_DIR` is set, and the ledger schema lives in `apps/server` rather than `packages/protocol`. Protocol owns wire contracts; nothing outside this app reads a ledger today, and widening that package for an absent consumer would cost more than moving the schema later if one appears.
