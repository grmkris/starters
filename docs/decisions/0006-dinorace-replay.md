# DinoRace: generated assets and a local authored replay

DinoRace is a single-user graphics experiment. Its replay is a pure, seekable function in `game-core`, sampled on a fixed 60 Hz timeline and interpolated by the browser adapter. `apps/web` now explicitly depends on `game-core` for this local replay. Shared multiplayer authority still belongs to the server; this experiment does not send or own shared room state.

The Blender worker lives in `apps/server` alongside the existing Effect lifecycle. Schema contracts live in `domain`; renderer inputs are structural contracts in `game-three`, keeping it independent of Effect and applications. Trusted Python belongs in `scripts/dinorace`. It produces a deliberately checked-in, original demo fixture in the web app's public directory. Page loads never invoke Blender.

The optional operator API uses the same worker as the CLI. No distributed queue, object store, physics engine, or LLM is introduced. Scene mutations that change geometry require a validated generation job; camera and replay controls remain local UI actions.

## Player-controlled driving

Manual solo driving now uses the same app-owned session and renderer source contract. `game-core/src/dinorace-driving.ts` is a deterministic fixed-step arcade reducer with bounded intent, track projection, recovery penalties and ordered lap checkpoints. Browser animation frames schedule the app's fixed-step accumulator; renderer callbacks never advance simulation. Pause, focus loss and mode changes release inputs. The authored replay remains a separate user-selected demo mode.

A future online room must run this step on the existing Bun server, add versioned intent/snapshot schemas to the existing protocol package, and adapt snapshots to the existing renderer source. Local lap times are not trusted online results. This change adds neither a new service nor a second simulation framework.
