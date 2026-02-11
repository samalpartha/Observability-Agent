/**
 * REGRESSION TESTS — Layout, overflow, error states, edge cases.
 * These catch visual regressions and defensive behavior.
 */
import { test, expect } from "@playwright/test";
import { loginViaAPI } from "./helpers";

// Helper: click the center Analyze button
async function clickAnalyze(page: import("@playwright/test").Page) {
  await page.getByRole("main").getByRole("button", { name: "Analyze" }).click();
}

test.describe("Regression Tests", () => {
  test.beforeEach(async ({ page, request }) => {
    await loginViaAPI(page, request);
  });

  test("R1: Left sidebar metrics don't overflow horizontally", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const metricsGrid = page.locator(".grid.grid-cols-3").first();
    if (await metricsGrid.isVisible()) {
      const box = await metricsGrid.boundingBox();
      expect(box!.width).toBeLessThanOrEqual(290);
    }
  });

  test("R2: No horizontal scrollbar on the whole page", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test("R3: Unauthenticated user is redirected to login", async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test("R4: Empty question — Analyze button is disabled, enabled when text entered", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const analyzeBtn = page.getByRole("main").getByRole("button", { name: "Analyze" });
    await expect(analyzeBtn).toBeVisible();
    // Button should be disabled when the question is empty
    await expect(analyzeBtn).toBeDisabled();

    // After entering text, the button should become enabled
    const centerInput = page.getByPlaceholder(/Ask Copilot about your stack/);
    await centerInput.fill("Test question");
    await expect(analyzeBtn).toBeEnabled({ timeout: 5_000 });
  });

  test("R5: Multiple rapid Analyze clicks don't crash", async ({ page }) => {
    await page.goto("/");
    const centerInput = page.getByPlaceholder(/Ask Copilot about your stack/);
    await centerInput.fill("Rapid test");

    const analyzeBtn = page.getByRole("main").getByRole("button", { name: "Analyze" });
    await analyzeBtn.click();
    await page.waitForTimeout(100);
    await analyzeBtn.click();
    await page.waitForTimeout(100);
    await analyzeBtn.click();

    await page.waitForTimeout(3000);
    await expect(page.getByText("Key Metrics")).toBeVisible();
  });

  test("R6: Long question text doesn't break layout", async ({ page }) => {
    await page.goto("/");
    const longText = "A".repeat(500);
    const centerInput = page.getByPlaceholder(/Ask Copilot about your stack/);
    await centerInput.fill(longText);
    await expect(centerInput).toHaveValue(longText);

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test("R7: Page is responsive at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // At mobile width, sidebar is hidden behind hamburger menu
    await expect(page.getByTestId("mobile-menu-button")).toBeVisible();
    // Key Metrics should be hidden until hamburger is tapped
    await expect(page.getByText("Key Metrics")).toBeHidden();
    // Tapping hamburger shows the sidebar
    await page.getByTestId("mobile-menu-button").click();
    await expect(page.getByText("Key Metrics")).toBeVisible();
    // Check that overflow-x-hidden prevents horizontal scroll
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test("R8: Error rate shows dash when no analysis run", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.removeItem("observability_copilot_run_history");
    });
    await page.reload();
    await page.waitForLoadState("networkidle");

    const errorRateCard = page.getByText("Error Rate", { exact: true }).locator("xpath=..");
    await expect(errorRateCard).toContainText("—");
  });

  test("R9: Recent Runs sidebar section is visible", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Recent Runs heading should always be visible (even with auto-run)
    await expect(page.getByText("Recent Runs")).toBeVisible();
  });

  test("R10: Connect page renders with form fields", async ({ page }) => {
    // Navigate to connect — token is already in localStorage from loginViaAPI
    await page.goto("/connect");
    // Wait for the connect page to settle (it checks mounted + getToken)
    await page.waitForTimeout(2000);

    // If redirected to login, the connect page requires login first
    const currentUrl = page.url();
    if (currentUrl.includes("/login")) {
      // Login then go to connect
      await page.getByPlaceholder("demo").fill("demo");
      await page.getByPlaceholder("••••••••").fill("demo123");
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL("/", { timeout: 5000 });
      await page.goto("/connect");
      await page.waitForTimeout(2000);
    }

    // Now verify the connect page rendered
    await expect(
      page.getByPlaceholder("https://xxx.es.region.gcp.elastic.cloud:443")
    ).toBeVisible({ timeout: 10_000 });
  });

  test("R11: Three-column layout renders at standard desktop width", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Key Metrics")).toBeVisible();
    const centerInput = page.getByPlaceholder(/Ask Copilot about your stack/);
    await expect(centerInput).toBeVisible();
  });

  test("R12: Saved prompts section renders without saved data", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.removeItem("observability_copilot_saved_prompts");
    });
    await page.reload();
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Saved prompts")).toBeVisible();
    await expect(page.getByText(/Save a question/)).toBeVisible();
  });
});
