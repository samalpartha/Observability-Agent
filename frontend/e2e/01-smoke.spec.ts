/**
 * SMOKE TESTS — "Does the app start and show the right things?"
 * These must pass for any other test to be meaningful.
 * No mocking. Tests hit the real running frontend and backend.
 */
import { test, expect } from "@playwright/test";
import { loginViaAPI, API_URL } from "./helpers";

test.describe("Smoke Tests", () => {
  test.beforeEach(async ({ page, request }) => {
    await loginViaAPI(page, request);
  });

  test("S1: Main page loads without JS errors", async ({ page }) => {
    const jsErrors: string[] = [];
    page.on("pageerror", (err) => jsErrors.push(err.message));

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // No uncaught JS exceptions
    expect(jsErrors, `JS errors on page: ${jsErrors.join("; ")}`).toHaveLength(0);
  });

  test("S2: Page title is set", async ({ page }) => {
    await page.goto("/");
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test("S3: Nav header renders with app name", async ({ page }) => {
    await page.goto("/");
    const header = page.locator("nav");
    await expect(header).toBeVisible();
    await expect(header).toContainText(/observability/i);
  });

  test("S4: Key Metrics section is visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Key Metrics")).toBeVisible();
    // Use exact match or scoped locator to avoid matching findings
    await expect(page.getByText("Error Rate", { exact: true })).toBeVisible();
    // Latency label is unique enough in the metric card
    const metricsGrid = page.locator(".grid.grid-cols-3").first();
    await expect(metricsGrid.getByText("Latency")).toBeVisible();
    await expect(metricsGrid.getByText("Throughput")).toBeVisible();
  });

  test("S5: Data sources section is visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Data sources")).toBeVisible();
    // Scope to the data sources card to avoid matching Logs button/findings
    const dsSection = page.locator("text=Data sources").locator("xpath=ancestor::div[contains(@class,'card')]");
    await expect(dsSection.getByText("Logs")).toBeVisible();
  });

  test("S6: Scope form is visible with Copilot input", async ({ page }) => {
    await page.goto("/");
    // Use heading role to get the unique Scope h2
    await expect(page.getByRole("heading", { name: "Scope" })).toBeVisible();
    const copilotInput = page.getByPlaceholder("Ask about anomalies...");
    await expect(copilotInput).toBeVisible();
  });

  test("S7: Center Ask Copilot bar renders", async ({ page }) => {
    await page.goto("/");
    const centerInput = page.getByPlaceholder(/Ask Copilot about your stack/);
    await expect(centerInput).toBeVisible();
  });

  test("S8: Analyze button is present in center bar", async ({ page }) => {
    await page.goto("/");
    // Use the center bar's Analyze button (inside <main>)
    const analyzeBtn = page.getByRole("main").getByRole("button", { name: "Analyze" });
    await expect(analyzeBtn).toBeVisible();
  });

  test("S9: Time range presets are visible", async ({ page }) => {
    await page.goto("/");
    for (const label of ["15m", "1h", "6h", "24h"]) {
      await expect(page.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
  });

  test("S10: Login page loads", async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await expect(page.getByPlaceholder("demo")).toBeVisible();
  });

  test("S11: Connect page loads with auth", async ({ page }) => {
    await page.goto("/connect");
    await page.waitForTimeout(2000);

    // If the connect page redirected to login, log in first
    if (page.url().includes("/login")) {
      await page.getByPlaceholder("demo").fill("demo");
      await page.getByPlaceholder("••••••••").fill("demo123");
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL("/", { timeout: 5000 });
      await page.goto("/connect");
      await page.waitForTimeout(2000);
    }

    // The connect page has Elasticsearch endpoint placeholder
    await expect(
      page.getByPlaceholder("https://xxx.es.region.gcp.elastic.cloud:443")
    ).toBeVisible({ timeout: 10_000 });
  });

  test("S12: Backend health endpoint responds", async ({ request }) => {
    const res = await request.get(`${API_URL}/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBeDefined();
    expect(["ok", "degraded", "error"]).toContain(body.status);
  });

  test("S13: No console errors after full page load", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        if (text.includes("favicon") || text.includes("icon.svg")) return;
        consoleErrors.push(text);
      }
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Ignore network errors to external services (expected in test env)
    const realErrors = consoleErrors.filter(
      (e) => !e.includes("Failed to fetch") && !e.includes("net::ERR") && !e.includes("401")
    );
    expect(realErrors, `Console errors: ${realErrors.join("; ")}`).toHaveLength(0);
  });
});
