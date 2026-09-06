import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Matches the server's own `Config.number("PORT")` default. */
const serverPort = process.env["PORT"] ?? "3001";

export default defineConfig({
  build: { chunkSizeWarningLimit: 1000 },
  plugins: [react(), tailwindcss()],
  server: {
    // The page and the socket share an origin, as they would behind a reverse
    // proxy in production, so the client never needs to know the server's port
    // and a device that can reach this dev server can reach the socket too.
    proxy: {
      "/api/dinorace": { target: `http://127.0.0.1:${serverPort}` },
      "/realtime": { target: `ws://127.0.0.1:${serverPort}`, ws: true },
    },
    // Two worktrees cannot both bind 3000, and `strictPort` is right to fail
    // loudly rather than drift to another port - so the port itself moves.
    port: Number(process.env["WEB_PORT"] ?? 3000),
    strictPort: true,
  },
});
