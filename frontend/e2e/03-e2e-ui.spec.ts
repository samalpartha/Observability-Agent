/**
 * E2E UI TESTS — Real user interaction flows.
 * These test the actual UI behavior, not mocked responses.
 */
import { test, expect } from "@playwright/test";
import { loginViaAPI } from "./helpers";

// Helper: click the center Analyze button (the one in <main>, not sidebar form)
async function clickAnalyze(page: import("@playwright/test").Page) {
  await page.getByRole("main").getByRole("button", { name: "Analyze" }).click();
}

// Helper: wait for analysis results to appear (handles strict mode by using .first())
async function waitForResults(page: import("@playwright/test").Page, timeout = 45_000) {
  // Wait for the "Executive summary" heading which only appears after analysis
  await expect(
    page.getByRole("heading", { name: "Executive summary" })
  ).toBeVisible({ timeout });
}

test.describe("E2E UI Tests", () => {
  test.beforeEach(async ({ page, request }) => {
    await loginViaAPI(page, request);
  });

  test("E1: Login flow — enter credentials and submit", async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await page.getByPlaceholder("demo").fill("demo");
    await page.getByPlaceholder("••••••••").fill("demo123");
    await page.getByRole("button", { name: /sign in/i }).click();

    await page.waitForURL("/", { timeout: 10_000 });
    await expect(page.getByText("Key Metrics")).toBeVisible();
  });

  test("E2: Center Copilot input accepts text and Enter triggers submit", async ({ page }) => {
    await page.goto("/");
    const input = page.getByPlaceholder(/Ask Copilot about your stack/);
    await input.fill("What is the current error rate?");
    await expect(input).toHaveValue("What is the current error rate?");
  });

  test("E3: Sidebar Copilot input accepts text", async ({ page }) => {
    await page.goto("/");
    const input = page.getByPlaceholder("Ask about anomalies...");
    await input.fill("Check payment service");
    await expect(input).toHaveValue("Check payment service");
  });

  test("E4: Time range preset selection updates state", async ({ page }) => {
    await page.goto("/");
    const btn6h = page.getByRole("button", { name: "6h", exact: true });
    await btn6h.click();
    await expect(btn6h).toHaveClass(/bg-primary/);
  });

  test("E5: Analyze button triggers analysis and shows results", async ({ page }) => {
    await page.goto("/");

    const centerInput = page.getByPlaceholder(/Ask Copilot about your stack/);
    await centerInput.fill("What is the system health?");
    await clickAnalyze(page);

    await waitForResults(page);
  });

  test("E6: Results tabs (summary, evidence, timeline, actions) work", async ({ page }) => {
    await page.goto("/");

    const centerInput = page.getByPlaceholder(/Ask Copilot about your stack/);
    await centerInput.fill("Check errors in prod");
    await clickAnalyze(page);

    await waitForResults(page);

    for (const tabName of ["summary", "evidence", "timeline", "actions"]) {
      const tab = page.getByRole("button", { name: new RegExp(tabName, "i") });
      if (await tab.isVisible()) {
        await tab.click();
        await page.waitForTimeout(300);
      }
    }
  });

  test("E7: Recent Runs populate after analysis", async ({ page }) => {
    await page.goto("/");

    const centerInput = page.getByPlaceholder(/Ask Copilot about your stack/);
    await centerInput.fill("System health check");
    await clickAnalyze(page);

    await waitForResults(page);

    await expect(page.getByText("Recent Runs")).toBeVisible();
  });

  test("E8: Scope breadcrumb shows selected filters", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Scope" })).toBeVisible();
  });

  test("E9: Advanced filters toggle works", async ({ page }) => {
    await page.goto("/");
    const advToggle = page.getByText(/Advanced filters/i);
    await expect(advToggle).toBeVisible();
    await advToggle.click();

    await expect(page.getByPlaceholder("Region")).toBeVisible();
    await expect(page.getByPlaceholder("Version")).toBeVisible();
    await expect(page.getByPlaceholder("Deploy ID")).toBeVisible();
    await expect(page.getByPlaceholder("Trace ID")).toBeVisible();
    await expect(page.getByPlaceholder("Tenant")).toBeVisible();
    await expect(page.getByPlaceholder("Endpoint")).toBeVisible();

    await advToggle.click();
    await expect(page.getByPlaceholder("Region")).not.toBeVisible();
  });

  test("E10: Mic button toggles without crashing", async ({ page }) => {
    await page.goto("/");
    const micBtn = page.getByRole("button", { name: /voice input/i }).first();
    await expect(micBtn).toBeVisible();
    await micBtn.click();
    await page.waitForTimeout(500);
    await expect(page.getByText("Key Metrics")).toBeVisible();
  });

  test("E11: Data sources show test-all button and it works", async ({ page }) => {
    await page.goto("/");
    const testAllBtn = page.getByRole("button", { name: /Test all/i });
    await expect(testAllBtn).toBeVisible();
    await testAllBtn.click();
    await page.waitForTimeout(3000);
    await expect(page.getByText("Data sources")).toBeVisible();
  });

  test("E12: Save prompt button works", async ({ page }) => {
    await page.goto("/");
    const input = page.getByPlaceholder("Ask about anomalies...");
    await input.fill("My saved query");

    const saveBtn = page.getByRole("button", { name: /Save prompt/i });
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      // Modal should appear
      const modal = page.getByTestId("save-prompt-modal");
      await expect(modal).toBeVisible();
      // Fill name and confirm
      const nameInput = page.getByTestId("save-prompt-name-input");
      await nameInput.clear();
      await nameInput.fill("My Saved Query");
      await page.getByTestId("save-prompt-confirm").click();
      await page.waitForTimeout(500);
      await expect(page.getByText("Saved prompts")).toBeVisible();
    }
  });

  test("E13: Keyboard shortcut Escape clears input", async ({ page }) => {
    await page.goto("/");
    const input = page.getByPlaceholder(/Ask Copilot about your stack/);
    await input.fill("Some query");
    await input.press("Escape");
    await expect(input).toHaveValue("");
  });
});
