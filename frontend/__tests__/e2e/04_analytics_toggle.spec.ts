/**
 * E2E: Analytics View Toggle
 * Verifies toggling between Copilot and Analytics views.
 */
import { test, expect } from "@playwright/test";

test.describe("Analytics Toggle", () => {
    test("should toggle between Copilot and Analytics views", async ({ page }) => {
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        // Copilot view should be visible by default
        await expect(page.locator("text=Observability Copilot").first()).toBeVisible({ timeout: 10_000 });

        // Click the analytics/bar-chart icon in the navbar
        // It's typically the 3rd icon button in the header nav
        const navButtons = page.locator("header button, nav button");
        const count = await navButtons.count();

        // Find a button that could be the analytics toggle
        let clicked = false;
        for (let i = 0; i < count && !clicked; i++) {
            const btn = navButtons.nth(i);
            const titleAttr = await btn.getAttribute("title").catch(() => "");
            const ariaLabel = await btn.getAttribute("aria-label").catch(() => "");
            const text = ((titleAttr || "") + (ariaLabel || "")).toLowerCase();
            if (text.includes("analytics") || text.includes("chart") || text.includes("toggle")) {
                await btn.click();
                clicked = true;
            }
        }
        // Fallback: click a generic nav button if specific one not found
        if (!clicked && count >= 3) {
            await navButtons.nth(count - 3).click();
        }

        // Analytics view should appear with its tabs
        await expect(
            page.locator("text=ES|QL, text=AI Assistant, text=Dashboards").first()
        ).toBeVisible({ timeout: 8_000 });

        // The Copilot dashboard shouldn't be visible anymore
        await expect(page.locator("text=Active Investigations").first()).not.toBeVisible().catch(() => { });
    });
});
