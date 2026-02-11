import { defineConfig, devices } from "@playwright/test";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:8765";
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3001";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // sequential so tests can share auth state
  forbidOnly: !!process.env.CI,
  retries: 1, // 1 retry always — SSE streaming can cause minor timing variance
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: FRONTEND_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Don't start webServer — we assume both servers are running
});
