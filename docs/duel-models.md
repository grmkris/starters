# Duel models

The duel renders a hover tank and a shot from code. Either can be replaced by a glTF file exported from Blender, dropped into `apps/web/public/models/`. The renderer loads what it finds there and keeps the procedural body when the file is missing or broken, so a model is never a blocker. The files there today are stand-ins written by `bun run models:fixture` (`tools/glb.ts`); overwrite them.

Open the room with `?models=off` to see the procedural bodies for comparison.

## Contract

| Aspect | Rule |
| --- | --- |
| Units | 1 Blender unit = 1 world unit. |
| Origin | The ground centre of the model. |
| Axes | **+X is forward**, toward the seam. **+Y is up**, which is the glTF exporter's default "+Y up". Z runs across. Side 1 is turned by π in the game, so model one side only. |
| `player.glb` | Fits within 0.8 (x) × 0.6 (y) × 0.8 (z). |
| `projectile.glb` | 0.5 long along +X, about 0.12 thick. Reserved; the shot is still the procedural streak in this version. |
| `cover.glb` | Later. Within 1 × 0.6 × 1. |
| Materials | Name the main material `Body` and any glowing strips `Accent`. Both are recoloured at load to the player's palette colour, so one file serves both sides. Other materials are kept as exported. |
| Shading | Flat. No textures are needed; low-poly reads best from above. |
| Export | glTF Binary (`.glb`), apply modifiers, no cameras or lights, no animation in the first pass. |

## How it is loaded

`packages/game-three/src/model-slot.tsx` loads the file with drei's `useGLTF` inside Suspense and an error boundary; the procedural model is the fallback for both. On load the scene is cloned and its `Body` and `Accent` materials are replaced with the palette's. The room page reports `data-model="loaded"` or `"fallback"` on its root, which the browser tests read.
