---
name: kit-game
description: Build or review simulation, ECS, Three.js, React Three Fiber, physics, rendering, replay, or game-networking work in this repository.
---

# Kit game

`packages/game-core` uses Koota and pure TypeScript. Systems advance on a fixed timestep and must run in Bun and headless tests. It cannot import Effect, React, Three, DOM, timers, networking, persistence, or wallet code.

`packages/game-three` reads world state and interpolates during `useFrame`. Do not call Effect, send network messages, allocate avoidable objects, or set React state in the render loop. DOM controls remain shadcn UI in `apps/web`.

Add Rapier only when collision/rigid-body ownership is defined. Treat WebGPU/TSL as a renderer adapter with a tested fallback. Verify canvas work through interaction and visual inspection because DOM assertions cannot prove rendered output.
