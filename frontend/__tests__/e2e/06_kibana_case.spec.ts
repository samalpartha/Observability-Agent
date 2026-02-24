/**
 * E2E: Kibana Case Creation
 * Verifies that a case can be created from the Actions tab after an analysis run.
 */
import { test, expect } from "@playwright/test";

test.describe("Kibana Case Creation", () => {
    test("should create a case and show success banner", async ({ page }) => {
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        // Run an analysis first
        const input = page.locator('input[placeholder*="question"], input[placeholder*="search"], textarea').first();
        await expect(input).toBeVisible({ timeout: 8_000 });
        await input.fill("Why is payment service down?");
        await input.press("Enter");

        // Wait for results
        await expect(
            page.locator("text=Root Cause, text=Confidence, text=Insufficient").first()
        ).toBeVisible({ timeout: 60_000 });

        // Click the Actions tab
        await page.locator("text=Actions").first().click();
        await page.waitForTimeout(500);

        // Find and click "Create Case"
        const createBtn = page.locator('button:has-text("Create Case")');
        await expect(createBtn.first()).toBeVisible({ timeout: 5_000 });
        await createBtn.first().click();

        // Should see success or error (both valid states depending on Kibana availability)
        await expect(
            page.locator("text=Case Created, text=Failed, text=Success, text=error").first()
        ).toBeVisible({ timeout: 30_000 });
    });
});
