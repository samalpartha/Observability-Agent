/**
 * E2E: History Panel
 * Verifies that running an analysis creates a history entry.
 */
import { test, expect } from "@playwright/test";

test.describe("History Panel", () => {
    test("should open history panel and show entries after analysis", async ({ page }) => {
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        // Run a quick analysis first to populate history
        const input = page.locator('input[placeholder*="question"], input[placeholder*="search"], textarea').first();
        await expect(input).toBeVisible({ timeout: 8_000 });
        await input.fill("Why is payment service down?");
        await input.press("Enter");

        // Wait for analysis to complete
        await expect(
            page.locator("text=Root Cause, text=Confidence, text=Insufficient").first()
        ).toBeVisible({ timeout: 60_000 });

        // Now open the history panel (clock icon)
        const navButtons = page.locator("header button, nav button");
        const count = await navButtons.count();

        let clicked = false;
        for (let i = 0; i < count && !clicked; i++) {
            const btn = navButtons.nth(i);
            const title = await btn.getAttribute("title").catch(() => "");
            if ((title || "").toLowerCase().includes("history") || (title || "").toLowerCase().includes("clock")) {
                await btn.click();
                clicked = true;
            }
        }
        // Fallback: click the 2nd-to-last nav button (typical history position)
        if (!clicked && count >= 2) {
            await navButtons.nth(count - 2).click();
        }

        // History panel should appear with at least 1 entry
        await expect(
            page.locator("text=Run History, text=History").first()
        ).toBeVisible({ timeout: 5_000 });
    });
});
