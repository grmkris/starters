import { defineConfig, devices } from "@playwright/test";

/**
 * Fixed ports collide on a shared machine, and a collision must not go
 * unnoticed: with reuse allowed, Playwright once tested a stranger's server
 * that happened to hold 3100. So the ports can move, and a held port fails
 * the run rather than being reused.
 */
const webPort = Number(process.env["E2E_WEB_PORT"] ?? 3100);
const serverPort = Number(process.env["E2E_SERVER_PORT"] ?? 3101);

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  forbidOnly: process.env["CI"] !== undefined,
  fullyParallel: true,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  reporter: process.env["CI"] === undefined ? "line" : "github",
  retries: process.env["CI"] === undefined ? 0 : 2,
  testDir: "./e2e",
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `PORT=${serverPort} bun run --cwd apps/server start`,
      port: serverPort,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `VITE_WS_URL=ws://127.0.0.1:${serverPort}/realtime bun run dev -- --host 127.0.0.1 --port ${webPort}`,
      cwd: "apps/web",
      port: webPort,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
