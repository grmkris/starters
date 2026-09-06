# 0007 — How the duel is drawn, heard and kept alive

Status: accepted on 2026-09-06.

**The seam is exact, so the camera is straight down and orthographic.** The whole premise is that a shot leaves one phone's screen edge and arrives at the other's. A perspective tilt projects anything above the ground past the lane's true edge, and two phones on a table would show a shot in both places or neither for a frame. Depth comes from an oblique shear on the group around the lane's contents, `z' = z − k·y`: every ground point stays where it is, and height slides up the screen, so a box shows its near face. It is a scene transform rather than a projection-matrix patch, so nothing has to be re-applied when the camera recomputes itself. `packages/game-three/src/oblique.ts` holds the matrix and its test.

**No bloom.** Neon reads best with it, but it is a full-screen pass a phone pays for every frame and it needs a package the renderer's allowlist in `tools/graph.ts` does not include. Glow comes from unlit, un-tone-mapped colours, additive blending on trails and sparks, and dark surroundings. Revisit after a real phone says otherwise.

**One event stream.** A snapshot says what is; the renderer, the sound and the vibration need what just happened. `apps/web/src/lib/realtime-store.ts` diffs consecutive snapshots once and announces `fire`, `bounce`, `cross`, `hit`, `round` and `match`; everything subscribes to that rather than diffing three times and disagreeing.

**Effects are pools, not children.** A tank is a React component because it lives as long as a player. Sparks, afterimages and flashes are instanced meshes written in the frame loop; React never learns of a particle. The directions of a burst are a fixed fan rather than random, which looks the same and needs no generator.

**Models are slots.** A glTF in `apps/web/public/models/` replaces the procedural body; a missing or broken file falls back to it behind an error boundary. Materials named `Body` and `Accent` are recoloured to the palette so one file serves both sides. The stand-ins are written by hand in `tools/glb.ts`, which is enough to prove the path without an exporter.

**The bot is a client.** It connects to the server it lives in and plays over the protocol, so the rules never learn it exists and a recorded bot match replays exactly. Bot rooms are flagged on their code, so a human who leaves and comes back finds it seated again.

**The heartbeat is the server's.** Bun's `idleTimeout` did not close a silent socket when tested with a one-second limit, so the tick loop closes any socket silent for twenty seconds from a per-socket last-seen stamp. The client pings every five.
