import { defineConfig, devices } from "@playwright/test";

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
    baseURL: "http://127.0.0.1:3100",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "PORT=3101 bun run --cwd apps/server start",
      port: 3101,
      reuseExistingServer: process.env["CI"] === undefined,
      timeout: 30_000,
    },
    {
      command:
        "VITE_WS_URL=ws://127.0.0.1:3101/realtime bun run dev -- --host 127.0.0.1 --port 3100",
      cwd: "apps/web",
      port: 3100,
      reuseExistingServer: process.env["CI"] === undefined,
      timeout: 30_000,
    },
  ],
});
