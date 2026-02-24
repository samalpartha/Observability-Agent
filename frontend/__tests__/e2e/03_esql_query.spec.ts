/**
 * E2E: ES|QL Query Execution
 * Verifies Analytics view loads, ES|QL query runs, and results table appears.
 */
import { test, expect } from "@playwright/test";

test.describe("ES|QL Query", () => {
    test("should run a query and show results table", async ({ page }) => {
        await page.goto("/");

        // Click the bar chart / analytics icon (BarChart3Icon in the navbar)
        const analyticsBtn = page.locator('button[title*="Analytics"], button[aria-label*="analytics"], [data-testid="analytics-toggle"]').first();
        // Fallback: look for any button with a bar-chart svg
        const navBtns = page.locator('header button, nav button');
        await page.waitForLoadState("networkidle");

        // Toggle to Analytics view by clicking the barchart icon  
        await page.locator('button:has-text(""), header svg').last().click().catch(async () => {
            // Try clicking the 3rd nav button (bar chart position)
            await navBtns.nth(2).click();
        });

        // Wait for the Analytics view to be visible
        await expect(page.locator("text=ES|QL Queries, text=AI Assistant, text=Dashboards").first()).toBeVisible({
            timeout: 8_000,
        });

        // Find the query textarea / editor
        const editor = page.locator("textarea, [role='textbox'], .cm-content").first();
        await expect(editor).toBeVisible({ timeout: 5_000 });

        await editor.click();
        await editor.fill("FROM obs-logs-current | LIMIT 5");

        // Click Run Query
        await page.locator('button:has-text("Run"), button:has-text("Execute"), button[type="submit"]').first().click();

        // Should see results — either a table or a row count
        await expect(
            page.locator("text=rows, table, [role='table'], text=results").first()
        ).toBeVisible({ timeout: 20_000 });
    });
});
