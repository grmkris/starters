# Zeleno — vegetable shop concept

Open `/zeleno` in the web app. This is a local, interactive concept for discussing the container layout and customer journey. The page is in Slovenian; ordering and payment are explicitly simulated.

The first layout assumes a **6.0 m long × 2.4 m wide × 2.6 m high** container. These are provisional dimensions, not measurements of the existing container.

## Explore the idea

- Drag to orbit, scroll or pinch to zoom, or use the 3D, front, and plan views. Selecting the plan view enables the cutaway.
- Toggle **Odprti prerez** to compare the interior layout and enclosed storefront.
- **Predvajaj naročilo** demonstrates a sample order: tomato, carrot, and lettuce. The overhead robot travels to each bin and places produce into the delivery box.
- Playback waits at **Potrdi demo plačilo**. Confirming it opens the shutter and delivers the box. This never makes a real payment.
- Pause, resume, reset, and replay are supported. Backgrounding pauses the walkthrough. Reduced-motion mode shows the completed packing and delivery states without continuous animation.
- On phones, playback controls sit directly below the scene so the robot remains easy to follow.

## Editable assets

- `assets/zeleno/zeleno.blend`: editable container, shelves, produce, terminals, hatch, box, forecourt, and a reference robot pose.
- `scripts/zeleno/build.py`: original, seeded Blender authoring script.
- `apps/web/public/zeleno/container.glb`: browser export, with named groups for the cutaway, roof, hatch, delivery box, and packed produce.
- `assets/zeleno/manifest.json`: source, units, Blender version, and provenance.

The Blender source retains separate editable objects. The export bakes modifiers and batches static geometry by material within each movable group: 32 mesh primitives, 68,784 triangles, 18 materials, no external textures, approximately 2.82 MB. All modeled geometry was authored for this project; there are no generated image or third-party asset dependencies.

The robot's moving links and gripper are rendered in React Three Fiber, using a two-link visual pose. Its animation lives in the website, not in Blender animation clips. `packages/game-three/src/zeleno-canvas.tsx` owns visual transforms; `apps/web/src/hooks/use-zeleno-demo.ts` owns the demonstration clock and payment stop. Effect owns the clock lifecycle. This local storyboard does not create rooms, backend orders, shared simulation state, or payment services.

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
