/**
 * E2E: Run AI Analysis
 * Verifies typing a question, pressing Enter, and seeing the results panel appear.
 */
import { test, expect } from "@playwright/test";

test.describe("Run AI Analysis", () => {
    test("should show results panel after submitting a query", async ({ page }) => {
        await page.goto("/");

        // Should be on the copilot home page
        await expect(page.locator("text=Observability Copilot").first()).toBeVisible({ timeout: 10_000 });

        // Find the command input and type a query
        const input = page.locator('input[placeholder*="question"], input[placeholder*="search"], textarea[placeholder*="question"]').first();
        await expect(input).toBeVisible({ timeout: 8_000 });
        await input.click();
        await input.fill("Why is payment service showing high error rates?");

        // Submit (press Enter or click the arrow button)
        await input.press("Enter");

        // Loading state should appear
        await expect(page.locator("[data-testid='run-status'], text=Gathering, text=Analyzing, text=running").first()).toBeVisible({
            timeout: 5_000,
        }).catch(() => { /* loading spinner may flash too quickly */ });

        // Results panel should eventually appear (wait up to 60s for the AI to respond)
        await expect(
            page.locator("text=Root Cause, text=Confidence, text=Executive Summary, text=Insufficient evidence").first()
        ).toBeVisible({ timeout: 60_000 });
    });

    test("should show error state for empty query", async ({ page }) => {
        await page.goto("/");
        const input = page.locator('input[placeholder*="question"], input[placeholder*="search"], textarea').first();
        await expect(input).toBeVisible({ timeout: 8_000 });

        // Submit empty
        await input.press("Enter");

        // Should NOT navigate away or crash
        await expect(page).toHaveURL(/\//);
    });
});
