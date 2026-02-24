import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./__tests__/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    // Bypass login for E2E tests by injecting a cookie/localStorage token
    storageState: "./__tests__/e2e/auth.json",
  },

  projects: [
    // Setup: login once and save storage state
    {
      name: "setup",
      testMatch: /.*auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Main E2E tests use the saved auth state
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],

  // Auto-start Next.js dev server if not already running
  webServer: {
    command: "npm run dev -- --port 3001",
    port: 3001,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
