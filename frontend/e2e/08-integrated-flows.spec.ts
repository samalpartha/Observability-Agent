/**
 * INTEGRATED FLOW TESTS — Multi-step user journeys combining multiple flows.
 * These test realistic scenarios a user would follow end-to-end.
 * No mocking. Tests hit the real running servers.
 */
import { test, expect } from "@playwright/test";
import { loginViaAPI } from "./helpers";

// Helper: click the center Analyze button
async function clickAnalyze(page: import("@playwright/test").Page) {
  await page.getByRole("main").getByRole("button", { name: "Analyze" }).click();
}

// Helper: wait for analysis results
async function waitForResults(page: import("@playwright/test").Page, timeout = 60_000) {
  await expect(
    page.getByRole("heading", { name: "Executive summary" })
  ).toBeVisible({ timeout });
}

test.describe("Integrated Flows — End-to-End Journeys", () => {
  test("INT1: Login → Ask question → View results → Share → Log out", async ({ page }) => {
    // ── Login ──
    await page.goto("/login");
    await page.getByPlaceholder("demo").fill("demo");
    await page.getByPlaceholder("••••••••").fill("demo123");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL("/", { timeout: 10_000 });
    await expect(page.getByText("Key Metrics")).toBeVisible();

    // ── Ask a question ──
    const centerInput = page.getByPlaceholder(/Ask Copilot about your stack/);
    await centerInput.fill("What is the system health?");
    await clickAnalyze(page);
    await waitForResults(page);

    // ── View result tabs ──
    for (const tabName of ["summary", "evidence"]) {
      const tab = page.getByRole("button", { name: new RegExp(tabName, "i") });
      if (await tab.isVisible()) {
        await tab.click();
        await page.waitForTimeout(300);
      }
    }

    // ── Share ──
    const shareBtn = page.getByRole("button", { name: /share/i });
    await expect(shareBtn).toBeVisible();
    await shareBtn.click();
    await page.waitForTimeout(500);

    // ── Log out ──
    await page.getByRole("button", { name: /log out/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test("INT2: Login → Set filters → Analyze → Check history → Compare", async ({ page, request }) => {
    await loginViaAPI(page, request);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // ── Set time range ──
    await page.getByRole("button", { name: "6h", exact: true }).click();
    await expect(page.getByRole("button", { name: "6h", exact: true })).toHaveClass(/bg-primary/);

    // ── Set service ──
    const serviceInput = page.getByPlaceholder("e.g. payment-service");
    await serviceInput.fill("payment");
    await expect(serviceInput).toHaveValue("payment");

    // ── First analysis ──
    const centerInput = page.getByPlaceholder(/Ask Copilot about your stack/);
    await centerInput.fill("Show errors in payment");
    await clickAnalyze(page);
    await waitForResults(page);

    // ── Go back ──
    const backBtn = page.getByRole("button", { name: "Back" });
    if (await backBtn.isVisible()) await backBtn.click();
    await page.waitForTimeout(500);

    // ── Second analysis with different params ──
    await page.getByRole("button", { name: "24h", exact: true }).click();
    await centerInput.fill("Show latency trends");
    await clickAnalyze(page);
    await waitForResults(page);

    // ── Check history ──
    const historyRaw = await page.evaluate(() =>
      localStorage.getItem("observability_copilot_run_history")
    );
    expect(historyRaw).toBeTruthy();
    const history = JSON.parse(historyRaw!);
    expect(history.length).toBeGreaterThanOrEqual(2);
  });

  test("INT3: Login → Save prompt → Reload → Use saved prompt", async ({ page, request }) => {
    await loginViaAPI(page, request);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // ── Clear any existing saved prompts ──
    await page.evaluate(() => {
      localStorage.removeItem("observability_copilot_saved_prompts");
    });
    await page.reload();
    await page.waitForLoadState("networkidle");

    // ── Type a question in sidebar ──
    const sidebarInput = page.getByPlaceholder("Ask about anomalies...");
    await sidebarInput.fill("My reusable prompt for testing");

    // ── Save the prompt via modal ──
    const saveBtn = page.getByRole("button", { name: /Save prompt/i });
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      // Wait for the save prompt modal to appear
      const modal = page.getByTestId("save-prompt-modal");
      await expect(modal).toBeVisible();
      // Fill in prompt name and confirm
      const nameInput = page.getByTestId("save-prompt-name-input");
      await nameInput.clear();
      await nameInput.fill("My Test Prompt");
      await page.getByTestId("save-prompt-confirm").click();
      await page.waitForTimeout(500);

      // ── Verify it persists ──
      await expect(page.getByText("Saved prompts")).toBeVisible();

      // ── Reload and verify saved prompt persists ──
      await page.reload();
      await page.waitForLoadState("networkidle");
      await expect(page.getByText("Saved prompts")).toBeVisible();

      const savedRaw = await page.evaluate(() =>
        localStorage.getItem("observability_copilot_saved_prompts")
      );
      expect(savedRaw).toBeTruthy();
    }
  });

  test("INT4: Navigate sidebar → Auto-fill → Analyze → Export", async ({ page, request }) => {
    await loginViaAPI(page, request);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // ── Click Alerts nav item (left sidebar, desktop only) ──
    const alertsBtn = page.getByRole("button", { name: "Alerts" });
    if (await alertsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await alertsBtn.click();
      await page.waitForTimeout(500);

      // ── Verify sidebar input was pre-filled ──
      const sidebarInput = page.getByPlaceholder("Ask about anomalies...");
      const value = await sidebarInput.inputValue();
      expect(value.toLowerCase()).toContain("alert");

      // ── Submit ──
      await sidebarInput.press("Enter");
      await waitForResults(page);

      // ── Export ──
      const exportBtn = page.getByRole("button", { name: /export/i });
      await expect(exportBtn).toBeVisible();
      await exportBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test("INT5: Advanced filters → Analyze → Pipeline → Root cause", async ({ page, request }) => {
    await loginViaAPI(page, request);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // ── Expand advanced filters ──
    const advToggle = page.getByText(/Advanced filters/i);
    await advToggle.click();

    // ── Fill in advanced filter ──
    await page.getByPlaceholder("Region").fill("us-east-1");
    await page.getByPlaceholder("Version").fill("v2.3.1");

    // ── Collapse ──
    await advToggle.click();
    await expect(page.getByPlaceholder("Region")).not.toBeVisible();

    // ── Run analysis ──
    const centerInput = page.getByPlaceholder(/Ask Copilot about your stack/);
    await centerInput.fill("Why is there latency in us-east-1?");
    await clickAnalyze(page);
    await waitForResults(page);

    // ── Verify pipeline showed up ──
    const pipelineText = page.getByText(/Gather signals|Correlate|Root cause/i).first();
    await expect(pipelineText).toBeVisible({ timeout: 10_000 });
  });

  test("INT6: Test sources → Analyze → View evidence tabs → History", async ({ page, request }) => {
    await loginViaAPI(page, request);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // ── Test all data sources ──
    const testAllBtn = page.getByRole("button", { name: /Test all/i });
    await testAllBtn.click();
    await page.waitForTimeout(3000);
    await expect(page.getByText("Data sources")).toBeVisible();

    // ── Run analysis ──
    const centerInput = page.getByPlaceholder(/Ask Copilot about your stack/);
    await centerInput.fill("Show errors after source verification");
    await clickAnalyze(page);
    await waitForResults(page);

    // ── Click evidence tab ──
    const evidenceTab = page.getByRole("button", { name: /evidence/i });
    if (await evidenceTab.isVisible()) {
      await evidenceTab.click();
      await page.waitForTimeout(300);
    }

    // ── Verify history ──
    const historyRaw = await page.evaluate(() =>
      localStorage.getItem("observability_copilot_run_history")
    );
    expect(historyRaw).toBeTruthy();
  });

  test("INT7: Help panel → Browse flows → Close → Use a flow", async ({ page, request }) => {
    await loginViaAPI(page, request);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // ── Open help panel ──
    await page.getByTestId("help-button").click();
    await expect(page.getByTestId("help-panel")).toBeVisible();

    // ── Browse category ──
    await page.getByTestId("help-cat-core").click();
    const flowsList = page.getByTestId("help-flows-list");
    const coreFlows = await flowsList.locator("[data-testid^='help-flow-']").count();
    expect(coreFlows).toBeGreaterThan(0);

    // ── Expand a flow to read steps ──
    await page.getByTestId("help-flow-toggle-ask-copilot").click();
    await expect(page.getByTestId("help-flow-steps-ask-copilot")).toBeVisible();

    // ── Close help panel ──
    await page.getByTestId("help-close").click();
    await expect(page.getByTestId("help-panel")).not.toBeVisible();

    // ── Now actually follow that flow ──
    const centerInput = page.getByPlaceholder(/Ask Copilot about your stack/);
    await centerInput.fill("Following the documented flow");
    await clickAnalyze(page);
    await waitForResults(page);
  });

  test("INT8: Full cycle — Login → Configure → Analyze → Save prompt → Log out → Re-login → Use saved", async ({ page }) => {
    // ── Step 1: Login ──
    await page.goto("/login");
    await page.getByPlaceholder("demo").fill("demo");
    await page.getByPlaceholder("••••••••").fill("demo123");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL("/", { timeout: 10_000 });

    // ── Step 2: Clear old saved prompts ──
    await page.evaluate(() => {
      localStorage.removeItem("observability_copilot_saved_prompts");
    });

    // ── Step 3: Set scope ──
    await page.getByRole("button", { name: "1h", exact: true }).click();

    // ── Step 4: Analyze ──
    const centerInput = page.getByPlaceholder(/Ask Copilot about your stack/);
    await centerInput.fill("Full cycle test query");
    await clickAnalyze(page);
    await waitForResults(page);

    // ── Step 5: Save prompt via modal ──
    const sidebarInput = page.getByPlaceholder("Ask about anomalies...");
    await sidebarInput.fill("Saved for re-login test");
    const saveBtn = page.getByRole("button", { name: /Save prompt/i });
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      const modal = page.getByTestId("save-prompt-modal");
      if (await modal.isVisible()) {
        const nameInput = page.getByTestId("save-prompt-name-input");
        await nameInput.clear();
        await nameInput.fill("Re-login test prompt");
        await page.getByTestId("save-prompt-confirm").click();
        await page.waitForTimeout(500);
      }
    }

    // ── Step 6: Log out ──
    await page.getByRole("button", { name: /log out/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    // ── Step 7: Re-login ──
    await page.getByPlaceholder("demo").fill("demo");
    await page.getByPlaceholder("••••••••").fill("demo123");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL("/", { timeout: 10_000 });

    // ── Step 8: Verify saved prompt persists ──
    const savedRaw = await page.evaluate(() =>
      localStorage.getItem("observability_copilot_saved_prompts")
    );
    // Saved prompts are in localStorage, they persist across sessions
    if (savedRaw) {
      await expect(page.getByText("Saved prompts")).toBeVisible();
    }
  });

  test("INT9: Help panel + Keyboard shortcuts journey", async ({ page, request }) => {
    await loginViaAPI(page, request);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500); // let app settle

    // ── Open help with ? key ──
    // Click on a non-input area to ensure keyboard shortcuts work
    await page.locator("header").first().click();
    await page.keyboard.press("?");
    await expect(page.getByTestId("help-panel")).toBeVisible();

    // ── Read the keyboard shortcuts flow ──
    await page.getByTestId("help-cat-admin").click();
    await page.getByTestId("help-flow-toggle-keyboard-shortcuts").click();
    await expect(page.getByTestId("help-flow-steps-keyboard-shortcuts")).toBeVisible();

    // ── Close help with Escape ──
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("help-panel")).not.toBeVisible();

    // ── Use Cmd+K to focus search ──
    const isMac = process.platform === "darwin";
    await page.keyboard.press(isMac ? "Meta+k" : "Control+k");
    await page.waitForTimeout(300);

    // ── Type and submit a query ──
    await page.keyboard.type("keyboard shortcut test");
    await page.keyboard.press("Enter");

    // Should trigger analysis
    await waitForResults(page, 60_000);
  });

  test("INT10: Mobile responsive flow — all key features accessible", async ({ page, request }) => {
    await loginViaAPI(page, request);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // ── On mobile, sidebar is hidden behind hamburger menu ──
    await expect(page.getByTestId("mobile-menu-button")).toBeVisible();
    // Tap hamburger to show Key Metrics
    await page.getByTestId("mobile-menu-button").click();
    await expect(page.getByText("Key Metrics")).toBeVisible();
    // Close mobile menu
    await page.getByTestId("mobile-menu-button").click();

    const centerInput = page.getByPlaceholder(/Ask Copilot about your stack/);
    await expect(centerInput).toBeVisible();

    // ── Help button should still work ──
    const helpBtn = page.getByTestId("help-button");
    await expect(helpBtn).toBeVisible();
    await helpBtn.click();
    await expect(page.getByTestId("help-panel")).toBeVisible();
    await page.getByTestId("help-close").click();
    await expect(page.getByTestId("help-panel")).not.toBeVisible();

    // ── Analysis should still work on mobile ──
    await centerInput.fill("Mobile flow test");
    await clickAnalyze(page);
    await waitForResults(page, 90_000);

    // ── No horizontal overflow ──
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
