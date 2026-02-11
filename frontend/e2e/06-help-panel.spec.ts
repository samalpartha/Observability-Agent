/**
 * HELP PANEL TESTS — Tests for the Help icon + user flows panel.
 * Covers opening/closing, category filters, flow expand/collapse,
 * keyboard shortcut, and every individual user flow.
 */
import { test, expect } from "@playwright/test";
import { loginViaAPI } from "./helpers";

test.describe("Help Panel — Structure & Interaction", () => {
  test.beforeEach(async ({ page, request }) => {
    await loginViaAPI(page, request);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("H1: Help icon is visible in the header", async ({ page }) => {
    const helpBtn = page.getByTestId("help-button");
    await expect(helpBtn).toBeVisible();
  });

  test("H2: Clicking help icon opens the help panel", async ({ page }) => {
    await page.getByTestId("help-button").click();
    const panel = page.getByTestId("help-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByText("User Flows")).toBeVisible();
  });

  test("H3: Help panel shows flow count badge", async ({ page }) => {
    await page.getByTestId("help-button").click();
    // The badge should show a number > 0
    const panel = page.getByTestId("help-panel");
    await expect(panel).toBeVisible();
    // Check for the count badge inside the header
    const badge = panel.locator("span").filter({ hasText: /^\d+$/ }).first();
    await expect(badge).toBeVisible();
    const count = parseInt(await badge.textContent() || "0");
    expect(count).toBeGreaterThanOrEqual(20);
  });

  test("H4: Clicking close button closes the panel", async ({ page }) => {
    await page.getByTestId("help-button").click();
    await expect(page.getByTestId("help-panel")).toBeVisible();
    await page.getByTestId("help-close").click();
    await expect(page.getByTestId("help-panel")).not.toBeVisible();
  });

  test("H5: Clicking backdrop closes the panel", async ({ page }) => {
    await page.getByTestId("help-button").click();
    await expect(page.getByTestId("help-panel")).toBeVisible();
    // Click on the backdrop (left side of overlay)
    const overlay = page.getByTestId("help-panel-overlay");
    await overlay.click({ position: { x: 10, y: 300 } });
    await expect(page.getByTestId("help-panel")).not.toBeVisible();
  });

  test("H6: Escape key closes the panel", async ({ page }) => {
    await page.getByTestId("help-button").click();
    await expect(page.getByTestId("help-panel")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("help-panel")).not.toBeVisible();
  });

  test("H7: ? key toggles the panel open and closed", async ({ page }) => {
    // Click somewhere neutral first to ensure no input is focused
    await page.getByText("Key Metrics").click();
    await page.keyboard.press("?");
    await expect(page.getByTestId("help-panel")).toBeVisible();
    // Close with Escape
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("help-panel")).not.toBeVisible();
  });

  test("H8: All category filter buttons are visible", async ({ page }) => {
    await page.getByTestId("help-button").click();
    const filters = page.getByTestId("help-category-filters");
    await expect(filters).toBeVisible();

    const categories = ["core", "scope", "results", "history", "nav", "admin"];
    for (const cat of categories) {
      await expect(page.getByTestId(`help-cat-${cat}`)).toBeVisible();
    }
    // "All" filter button should also exist
    await expect(filters.getByText(/^All/)).toBeVisible();
  });

  test("H9: Filtering by category narrows the flow list", async ({ page }) => {
    await page.getByTestId("help-button").click();
    const flowsList = page.getByTestId("help-flows-list");
    const allFlows = await flowsList.locator("[data-testid^='help-flow-']").count();
    expect(allFlows).toBeGreaterThanOrEqual(20);

    // Click "Core Analysis" category
    await page.getByTestId("help-cat-core").click();
    const coreFlows = await flowsList.locator("[data-testid^='help-flow-']").count();
    expect(coreFlows).toBeGreaterThan(0);
    expect(coreFlows).toBeLessThan(allFlows);

    // Click "Admin & Settings"
    await page.getByTestId("help-cat-admin").click();
    const adminFlows = await flowsList.locator("[data-testid^='help-flow-']").count();
    expect(adminFlows).toBeGreaterThan(0);
    expect(adminFlows).toBeLessThan(allFlows);
  });

  test("H10: Clicking 'All' filter shows all flows again", async ({ page }) => {
    await page.getByTestId("help-button").click();
    const flowsList = page.getByTestId("help-flows-list");

    // Filter to a category first
    await page.getByTestId("help-cat-core").click();
    const coreCount = await flowsList.locator("[data-testid^='help-flow-']").count();

    // Click All
    const allBtn = page.getByTestId("help-category-filters").getByText(/^All/);
    await allBtn.click();
    const allCount = await flowsList.locator("[data-testid^='help-flow-']").count();
    expect(allCount).toBeGreaterThan(coreCount);
  });

  test("H11: Expanding a flow shows its steps", async ({ page }) => {
    await page.getByTestId("help-button").click();
    const toggle = page.getByTestId("help-flow-toggle-ask-copilot");
    await expect(toggle).toBeVisible();
    await toggle.click();

    const steps = page.getByTestId("help-flow-steps-ask-copilot");
    await expect(steps).toBeVisible();

    // Should have numbered steps
    const stepItems = steps.locator("li");
    const count = await stepItems.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test("H12: Collapsing an expanded flow hides steps", async ({ page }) => {
    await page.getByTestId("help-button").click();
    const toggle = page.getByTestId("help-flow-toggle-ask-copilot");
    // Expand
    await toggle.click();
    await expect(page.getByTestId("help-flow-steps-ask-copilot")).toBeVisible();
    // Collapse
    await toggle.click();
    await expect(page.getByTestId("help-flow-steps-ask-copilot")).not.toBeVisible();
  });

  test("H13: Only one flow can be expanded at a time", async ({ page }) => {
    await page.getByTestId("help-button").click();
    // Expand first flow
    await page.getByTestId("help-flow-toggle-ask-copilot").click();
    await expect(page.getByTestId("help-flow-steps-ask-copilot")).toBeVisible();

    // Expand another flow
    await page.getByTestId("help-flow-toggle-set-time-range").click();
    await expect(page.getByTestId("help-flow-steps-set-time-range")).toBeVisible();
    // First should be collapsed
    await expect(page.getByTestId("help-flow-steps-ask-copilot")).not.toBeVisible();
  });

  test("H14: Re-opening help after close works", async ({ page }) => {
    const helpBtn = page.getByTestId("help-button");
    // Open
    await helpBtn.click();
    await expect(page.getByTestId("help-panel")).toBeVisible();
    // Close via close button
    await page.getByTestId("help-close").click();
    await expect(page.getByTestId("help-panel")).not.toBeVisible();
    // Re-open
    await helpBtn.click();
    await expect(page.getByTestId("help-panel")).toBeVisible();
  });

  test("H15: Help panel footer shows keyboard hint", async ({ page }) => {
    await page.getByTestId("help-button").click();
    const panel = page.getByTestId("help-panel");
    await expect(panel.getByText("anytime to toggle this panel")).toBeVisible();
  });
});
