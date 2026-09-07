# Zeleno — vegetable shop concept

Open `/zeleno` in the web app. This is a local, interactive concept for discussing the container layout and customer journey. The page is in Slovenian; ordering and payment are explicitly simulated.

The first layout assumes a **6.0 m long × 2.4 m wide × 2.6 m high** container. These are provisional dimensions, not measurements of the existing container.

## Explore the idea

- Drag to orbit, scroll or pinch to zoom, or use the 3D, front, and plan views. Selecting the plan view enables the cutaway.
- Toggle **Odprti prerez** to compare the interior layout and enclosed storefront.
- **Police**, **Robot**, and **Prevzem** move the camera into a close-up with a short explanation. **Celota** restores the overview. Camera moves ease to rest; dragging interrupts them.
- **Večerni pogled** shows the container with warm interior lighting.
- The basket counts packed items, and each picked vegetable disappears from its shelf before being carried into the box.
- **Predvajaj naročilo** demonstrates a sample order: tomato, carrot, and lettuce. The overhead robot travels to each bin and places produce into the delivery box.
- Playback waits at **Potrdi demo plačilo**. Confirming it opens the shutter and delivers the box. This never makes a real payment.
- Pause, resume, reset, and replay are supported. Backgrounding pauses the walkthrough. Reduced-motion mode shows the completed packing and delivery states without continuous animation.
- On phones, playback controls sit directly below the scene so the robot remains easy to follow.

## Editable assets

- `assets/zeleno/zeleno.blend`: editable container, shelves, produce, terminals, hatch, box, forecourt, and a reference robot pose.
- `scripts/zeleno/build.py`: original, seeded Blender authoring script.
- `apps/web/public/zeleno/container.glb`: browser export, with named groups for the cutaway, roof, hatch, delivery box, and packed produce.
- `assets/zeleno/manifest.json`: source, units, Blender version, and provenance.

The Blender source retains separate editable objects. The export bakes modifiers and batches static geometry by material within each movable group: 52 mesh primitives, 158,372 triangles, 23 materials, no external textures, approximately 5.59 MB. All modeled geometry was authored for this project; there are no generated image or third-party asset dependencies.

The detailed model includes layered lettuce, tapered carrots, lobed tomatoes and stems, shelf hardware, indexed bins, a cable tray, rail fittings, terminal controls, a service cabinet, and cylindrical conveyor rollers.

The robot's moving links and soft gripper are rendered in React Three Fiber, using a two-link visual pose. Carried vegetables clone the corresponding stock geometry. The continuous motion path is sampled into reusable state by `packages/game-three/src/zeleno-motion.ts`; pick and drop heights match the model's stock and box anchors. Fixed environment captures give metal its reflections; one shadow-casting directional light supplies contact shadows. Warm interior point lights do not cast additional shadow maps. Its animation lives in the website, not in Blender animation clips. `packages/game-three/src/zeleno-canvas.tsx` owns visual transforms; `apps/web/src/hooks/use-zeleno-demo.ts` owns the demonstration clock and payment stop. Effect owns the clock lifecycle. This local storyboard does not create rooms, backend orders, shared simulation state, or payment services.

To rebuild with the installed worker image, run from the repository root:

```sh
docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
  --tmpfs /tmp:size=1g,mode=1777 --cpus 4 --memory 4g --pids-limit 256 \
  -v "$PWD:/workspace:ro" \
  -v "$PWD/assets/zeleno:/workspace/assets/zeleno" \
  -v "$PWD/apps/web/public/zeleno:/workspace/apps/web/public/zeleno" \
  --entrypoint /opt/blender/blender starters-blender-worker:latest \
  --background --factory-startup --disable-autoexec --threads 4 \
  --python-exit-code 1 --python /workspace/scripts/zeleno/build.py
bunx --bun oxfmt --write assets/zeleno/manifest.json
```

The worker uses Blender 4.5.3 LTS. This command only writes the Zeleno source and export directories. For edits made directly in Blender, preserve a separate edited source: rebuilding replaces `zeleno.blend` with the scripted layout.

## What to decide together

Confirm the real container dimensions and refill access first. Then choose one initial product and decide whether it is sold by piece, as a prepacked unit, or by weight. That choice informs the bins, gripper, weighing, packing, and checkout flow. Refrigeration, sanitation, machine guarding, stock sensing, reach and collision validation, accessibility, and real payment confirmation need a separate engineering design. The depicted motion is illustrative.

For this brainstorming stage, the editable model plus a browser walkthrough lets you review both the space and the sequence. Blender's [glTF export](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html) supplies the web asset; [React Three Fiber](https://r3f.docs.pmnd.rs/) supplies the interactive renderer.

## Verification

Run `E2E_WEB_PORT=3210 E2E_SERVER_PORT=3211 bun run e2e e2e/zeleno.spec.ts --workers=1`. The tests exercise ordering, a frozen canvas during pause, payment gating, delivery, reset, cutaway controls, narrow layouts, reduced motion, and model-load recovery. The initial walkthrough tests were run before the route existed and failed as expected.

Browser captures are saved in `assets/zeleno/`: `desktop.png`, `picking.png`, `payment.png`, `collection.png`, `top.png`, and `mobile.png`. Chromium's software-rendered checks establish functionality and visible output, not performance on a physical phone GPU.

Detail revision 02 adds browser coverage for close-up cameras, evening lighting, packing counts, and narrow layouts. The new browser test was run against the earlier page and failed on the missing shelf-detail control before implementation. Motion tests check continuous movement through the whole sequence, visual reach, pick/drop height, and reset. The unpaused sequence and renderer measurements are recorded in `assets/zeleno/detail-02/`; software-rendered Chromium counters are not physical-device performance measurements.

Measured at 1440 × 1100, DPR 1: the detailed scene uses 135 draw calls including the shadow pass, versus 61 in the original overview. The detailed run rendered zero additional frames during both an 800 ms idle interval and an 800 ms payment wait. Counters include shadow rendering; the static environment capture is a one-time setup cost. The model grows from 2.82 MB to 5.59 MB.
