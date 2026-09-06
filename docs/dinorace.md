# DinoRace / experiment 01

A playable solo time trial and browser graphics experiment: Aurelia, a pearl-white two-horned unicorn, seated in a fictional Formula-style car on a night circuit. This is a working asset-generation and inspection pipeline, not a vehicle-physics game or a claim of photorealistic anatomy.

## Run the experience

```bash
bun install
bun run dev
```

Open **http://localhost:3000/dinorace**. The original, generated demo fixture is intentionally checked in under `apps/web/public/dinorace-assets/`. Blender is unnecessary for browsing, building, or deploying that fixture. `WEB_PORT` and `PORT` override the normal web/server ports.

## The current racer: Aurelia

The default `unicorn` species is an original Blender-authored equine morphology with a fused/remeshed pearl coat, two individually named gold horns with ivory spirals, swept silver/violet mane and tail locks, a gold harness, and a midnight-violet Formula car. It replaces the previous default theropod. There is still one racer, with the same solo driving, audio, mobile input, inspection and debug controls.

`scripts/dinorace/blender/unicorn.py` contains the reproducible source. No third-party model or paid generation provider is needed. The manifest carries the racer name/classification, decorative mass estimate and two horn nodes; the HUD reads that identity. GLB URLs include the job ID to invalidate previously loaded racer geometry. `trex` and `raptor` remain available in custom generation jobs; `unicorn` accepts only the procedural source. The historical JSON field name `dinosaur` is retained for job compatibility.

## Playing

The default mode is **solo driving**, not autoplay. Hold **W / ↑** to accelerate, **S / ↓** to brake, and **A D / ← →** to steer. Throttle starts driving automatically. The touch/hold buttons provide the same inputs on phones. **Space** pauses/resumes, **R** resets, **F** recovers to the nearest track centre with a three-second penalty, and **F2** opens engineering mode. Steering owns D while driving. Browser focus loss releases input and pauses.

On mobile, hold **GAS** with your right thumb and **← / →** with your left; both fingers work independently. Releasing or cancelling a touch clears that input. Portrait and landscape are supported; landscape provides more road visibility. AUTO reduces the rendering budget on coarse-pointer devices. The mobile layout is browser-tested with emulated touch, not a guarantee of performance on every phone.

Tap **SOUND OFF** to enable original Web Audio synthesis: a layered engine whose pitch follows speed/gears, shift dips, road noise, and tyre scrub under braking/steering. No copyrighted recordings or audio downloads are used. Audio is silent until opted in, fades on pause/reset, mutes on background/focus loss, and closes when leaving the route. Tap again after returning to enable it. Unsupported audio does not stop driving.

Drive a full forward circuit through three ordered checkpoints to record a lap. The HUD shows the current lap, best time for this page session, and a circuit-position map. Recovery cannot advance checkpoints. The car uses a fixed-step arcade bicycle model, with speed-sensitive steering, braking, drag, runoff slowdown, and a soft track-boundary response—not tyre or rigid-body physics. No reverse gear is implemented; use recovery when needed.

**Watch demo** switches to the original 32-second authored replay; **Take wheel** returns to manual control. **C** cycles cameras; **1**, **2**, **3** select cinematic, chase, and paused inspection. The raised chase camera keeps the road visible above the driver. **D** still toggles engineering in demo mode. Inspect cycles assembly → driver → vehicle and pauses playback. Reduced-motion preferences skip the introduction.

This is **not online multiplayer yet**. The pure driving step lives in `game-core`, so a future DinoRace room can advance the same simulation on the existing authoritative Bun server. Clients should send bounded driving intents through a versioned protocol, never trusted positions or lap times. No second server or separate project is needed.

AUTO selects LOW on narrow/coarse-pointer devices and software renderers. LOW uses DPR 1, 24 particles, no shadow map or mirror pass. HIGH uses up to DPR 1.5, 100 particles, a 1024 shadow map and 512 reflection target. INSANE raises DPR to 2, shadows to 2048 and reflections to 1024. These are rendering budgets, not performance guarantees. WebGL2 is the runtime renderer; WebGPU and a discrete GPU are not required. A lost rendering context produces a retry/diagnostics screen.

## Architecture

```text
Effect Schema job → Effect worker → isolated job directory → trusted Blender Python
                                                           ↓
                                              scene.glb + preview.png + manifest.json
                                                           ↓
                            static web fixture / private operator asset endpoint
                                                           ↓
                     lazy TanStack route → game-three / R3F renderer
                                              ↑
                    game-core authored replay ← app-owned local playback clock
```

`packages/domain/src/dinorace.ts` is the input and artifact contract. All dimensions are metres; exported metadata is glTF Y-up with forward +Z. TypeIDs come from the existing central identifier registry. `apps/server/src/dinorace/worker.ts` owns validation, hashing, subprocess scope, timeout and output validation. `scripts/dinorace/blender/` owns procedural geometry, embedded texture generation, fitting, mesh batching, export and preview. The browser generates its track/environment, loads the **actual Blender racer GLB**, and uses manifest node names for driver/car inspection and wheel pivots. Blender is never streamed or invoked by a page load.

`packages/game-core/src/race.ts` provides a pure Catmull–Rom racing line, arc-length lookup and integrated speed timeline. Hosts can seek any time without previous simulation steps. The web adapter samples the demo at fixed 60 Hz. In manual mode, the app advances the driving simulation at 60 Hz and the renderer only interpolates completed states; UI telemetry updates at 5 Hz. Catch-up is capped after long browser stalls. This is a single-user replay, with no shared multiplayer state. See [the boundary decision](decisions/0006-dinorace-replay.md).

## Generate locally on Linux

Install the official **Blender 4.5.3 LTS Linux x64** distribution, or use the Docker worker below. No Python packages need installing: the scripts use Blender's bundled Python, bpy and standard library.

```bash
BLENDER_BIN=/path/to/blender-4.5.3-linux-x64/blender bun run dinorace:generate
# If blender is already on PATH:
bun run dinorace:generate
# A custom plain job specification, validated before Blender starts:
bun run dinorace:generate ./my-job.json
```

Example `my-job.json`:

```json
{
  "version": 1,
  "seed": 19,
  "dinosaur": { "species": "unicorn", "source": "procedural", "scale": 1 },
  "vehicle": {
    "archetype": "formula",
    "wheelbase": 4.4,
    "trackWidth": 3.8,
    "cockpitScale": 1
  },
  "scene": { "environment": "night-track", "quality": "production" },
  "output": { "preview": true }
}
```

GLB output is mandatory; preview is optional. Draft quality decimates the driver before export. The generator publishes successful output to the demo fixture directory; **this intentionally replaces the demo files**, so preserve a fixture you wish to keep before generating another variant. Rebuild the web app after changing a deployed fixture.

Jobs live under `.dinorace/jobs/<TypeID>/`, containing `input.json` (a validated job plus its provenance envelope), `working/`, `output/`, and `logs/blender.log`. `.dinorace/` is ignored by Git. An absent Blender executable reports the installation and `BLENDER_BIN` instructions. Failed jobs retain their input and logs and do not publish incomplete output.

To rerun an existing validated envelope directly:

```bash
blender --background --factory-startup --disable-autoexec --threads 4 \
  --python-exit-code 1 --python scripts/dinorace/blender/build.py -- \
  --job .dinorace/jobs/<job-id>/input.json \
  --output .dinorace/jobs/<job-id>/output
```

The cache hashes the canonical validated specification and additionally keys on trusted Python content, imported source content, and render-device choice. Valid cached artifacts can be reused even if Blender is not currently installed. Generation uses deterministic names, seeded texture generation and fixed geometry. Provenance timestamps, job identifiers and durations naturally differ on a fresh job. Keep Blender pinned when comparing generated geometry across machines.

## Docker worker

```bash
bun install
mkdir -p .dinorace apps/web/public/dinorace-assets
docker compose -f compose.dinorace.yml build blender-worker
DINORACE_UID=$(id -u) DINORACE_GID=$(id -g) \
  docker compose -f compose.dinorace.yml run --rm blender-worker
```

The image pins Blender 4.5.3, verifies the archive against the official SHA256 list, and supplies Bun plus Mesa/EGL for headless CPU rendering. The compose profile runs under your numeric UID/GID, drops capabilities, disables networking, makes the repository and container filesystem read-only, and mounts only job storage and the explicit fixture output writable. It defaults to four CPUs, 4 GB RAM, 256 processes and a 1 GB `/tmp`; tune `DINORACE_CPUS`, `DINORACE_MEMORY`, `DINORACE_UID`, and `DINORACE_GID` for the host. No display server or X11 socket is mounted. Native dependencies installed by `bun install` must be Linux-compatible on the Linux worker.

## CPU and optional GPU

`DINORACE_BLENDER_RENDER_DEVICE=cpu` is the baseline. It uses headless Eevee/Mesa; if the render API reports failure, it retries using Cycles CPU. For `cuda`, `optix`, or `auto`, the preview selects Cycles, attempts the requested GPU device (`auto` attempts OptiX), and falls back to CPU when device initialization fails. Geometry generation and GLB export do not require a GPU. Preview quality may differ between Eevee and Cycles; neither is the browser renderer.

For an NVIDIA host with NVIDIA Container Toolkit, use a compose override enabling GPU access or an equivalent `docker run --gpus all` invocation with the same mounts and restrictions. GPU execution has not been verified on NVIDIA hardware in this implementation; the CPU container path has been exercised.

## Optional operator API

The normal server leaves the worker API disabled. Set a strong `DINORACE_WORKER_TOKEN` and `BLENDER_BIN` on a **trusted operator server** to enable it. Do not embed this token in frontend code. `DINORACE_JOB_ROOT` can point to persistent local storage. Vite proxies `/api/dinorace` to the normal Bun server.

```text
POST /api/dinorace/jobs                         Bearer token + validated JSON job
GET  /api/dinorace/jobs/:id                     queued/running/succeeded/failed
GET  /api/dinorace/jobs/:id/manifest
GET  /api/dinorace/jobs/:id/assets/scene.glb
GET  /api/dinorace/jobs/:id/assets/preview.png
```

One job runs at a time, with up to eight waiting and 64 status records. Cache hits may refer to an earlier generation's manifest job ID; the submission ID identifies the status record. API status history is process-local and is lost on restart; successful artifact caches remain on disk. Shutdown interrupts active work. The API does not replace the public fixture automatically. Retrieve the result through its manifest and assets endpoints; the local CLI handles deliberate fixture publication.

## Security and deployment

The API accepts no Python, command, arbitrary asset URL, path, or shell arguments. Unknown fields and out-of-range geometry are rejected before execution. Bodies are capped at 4096 bytes; logs at 2 MB; successful GLBs at 20 MB and previews at 8 MB. Jobs have a ten-minute deadline. Assets are served only from successful job records and an exact filename allowlist. Subprocesses use argument arrays, trusted repository scripts, an isolated working directory and a minimal environment, without application secrets.

The local/operator subprocess adapter is **not a security boundary for untrusted scripts**. Container isolation provides the stronger resource/filesystem limits. Keep the token-protected generation endpoint private or additionally protect it at your ingress; GET status/output routes assume possession of the job identifier and contain technical diagnostics. Apply external rate limits and a disk quota/retention policy before exposing an operator service. The V1 worker does not automatically prune disk history or run arbitrary agent-generated Python.

The normal repository Dockerfile builds the web app and serves the checked-in assets from the existing Bun process; it does not need Blender. For a remote Linux generation host, install the repository and Bun dependencies, mount persistent job storage, and use the dedicated worker image. A future queue adapter can replace the in-process serial queue while retaining the same job and manifest contracts. Copy complete versioned outputs to object storage and publish the manifest last.

## Inspection and measurements

D toggles mirror rendering off, enables wireframe/bounds/racing line, and reveals generation provenance. Individual controls expose the scene graph, named object labels, exported AABB collider proxies, skull vertex normals, camera path, actual light helper, and fit-anchor chain. **Fit anchors are not a skeletal rig.** The manifest reports that the fixture has zero animation clips. Wheel motion and camera choreography are browser-scripted.

The Aurelia fixture is approximately 1.62 MiB with 79,826 triangles, 16 materials and no texture downloads. Pearl clearcoat, metallic horns and shared strand materials export as glTF PBR materials. Material batching preserves independent car/driver/wheel roots. Runtime draw calls include active rendering passes; triangle counters exclude wireframe lines. FPS and load time are measured locally, not marketing numbers. Headless Chromium software rendering is substantially slower than hardware WebGL; no hardware frame-rate claim has been made.

Fitting widens the cockpit from estimated seated hip width and reports driver dimensions, head height above the halo reference, cockpit margin, and tail/vehicle AABB overlaps. The collision proxies and overlap count are engineering approximations, not biomechanical or triangle-accurate collision detection.

## Tests

```bash
bun run check:fast
bun run check
bun run e2e --workers=1
# Collision-free ports when another checkout is running:
E2E_WEB_PORT=3430 E2E_SERVER_PORT=3431 bun run e2e e2e/dinorace.spec.ts --workers=1
# Optional real Blender smoke test (skipped in ordinary CI):
DINORACE_BLENDER_SMOKE=1 BLENDER_BIN=/path/to/blender \
  bun test apps/server/test/dinorace-api.test.ts
```

Tests cover bounded job input, canonical hashing, path safety, argument construction, missing executable and timeout behavior, private submission validation, fixture GLB/named-node integrity, seekable replay, browser loading, engineering toggle, reset, mobile controls and missing-manifest recovery. Blender preview/export has also been run inside the CPU Docker worker.

## Future agent loop and limitations

An agent should translate a request into a validated `DinoRaceAssetJob`, submit it, wait for a successful manifest, inspect `preview.png` and numeric fit diagnostics, then issue another bounded specification. Keep model-generated Python out of the current worker. Store the specification, input hash, generated artifacts and visual critique together so iterations can be compared and reproduced. Weather/camera changes can eventually use separate typed runtime commands; dinosaur/cockpit changes regenerate assets. No LLM integration is present today.

Aurelia is a stylized original equine sculpt, not a rigged or photorealistic horse. Its mane and tail are static meshes; only the car/wheels move at runtime. The retained theropod generator is a simplified procedural morphology. The raptor option scales that theropod morphology; it is not a second anatomically distinct or independently animated racer. A trusted `studio-trex` source selector imports `scripts/dinorace/sources/studio-trex.glb`, normalizes bounds and fits its scale. That source is intentionally absent: supply a licensed, seated, Y-up source and adapt its fit anchors for the actual anatomy. No remote downloads occur during jobs.

There is one racer, repeatable solo timed laps plus one authored demo lap, no online multiplayer, rigid-body simulation, skeletal animation, rain, online generation UI, persistent job queue, or automatic disk retention. The passing-line event demonstrates lateral motion without a second opponent. RPM, mass and anger are theatrical telemetry; speed and progress come from manual driving or the explicitly selected authored replay. Local lap times are practice results, not an authoritative leaderboard. The highest-value next work is a better licensed dinosaur mesh, a real rig/driver animation, a second racer, structured natural-language commands, and remote GPU generation with preview/vision feedback.
