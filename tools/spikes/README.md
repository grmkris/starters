# Toolchain spikes

One-off probes, not part of `bun run check`.

```bash
bun tools/spikes/verify-unused-surface.ts
bun tools/spikes/verify-frontend-toolchain.ts
```

The frontend spike compares Vite production, raw `bun build`, and Bun JS plus official Tailwind CLI CSS. A follow-up `Bun.build({ define })` pass is required before the home route mounts, because `import.meta.env.VITE_WS_URL` is Vite-shaped.
