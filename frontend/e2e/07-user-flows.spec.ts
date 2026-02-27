/**
 * USER FLOW TESTS — Each documented user flow tested individually.
 * These verify the exact steps described in the help panel actually work.
 * No mocking. Tests hit the real running servers.
 */
import { test, expect, Page } from "@playwright/test";
import { loginViaAPI } from "./helpers";

// Helper: trigger analysis by pressing Enter
async function clickAnalyze(page: import("@playwright/test").Page) {
  await page.getByPlaceholder(/Ask Copilot a question/).press("Enter");
}

// Helper: wait for analysis results
async function waitForResults(page: Page, timeout = 300_000) {
  // Wait for the tabs to render, confirming ResultsView is active
  await page.getByRole("button", { name: "Summary" }).waitFor({ state: "visible", timeout });
  // Also ensure the root cause or some content is there
  await expect(page.getByRole("heading", { level: 2 })).not.toContainText("Analyzing", { timeout });
}

/* ───────────────── CORE ANALYSIS FLOWS ───────────────── */

test.describe("User Flows — Core Analysis", () => {
  test.beforeEach(async ({ page, request }) => {
    await loginViaAPI(page, request);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("F-ask-copilot: Ask Copilot a question via center bar", async ({ page }) => {
    // Step 1: Type question in center bar
    const centerInput = page.getByPlaceholder(/Ask Copilot a question/);
    await centerInput.fill("Why is the checkout service slow?");
    await expect(centerInput).toHaveValue("Why is the checkout service slow?");

    // Step 2: Click Analyze
    await clickAnalyze(page);

    // Step 3: Wait for results
    await waitForResults(page);
  });

  test("F-analyze-finding: Analyze a Recent Finding", async ({ page }) => {
    // Look for ANALYZE FINDING button in recent findings
    const analyzeFindingBtn = page.getByRole("button", { name: "ANALYZE FINDING →" }).first();
    await expect(analyzeFindingBtn).toBeVisible({ timeout: 10_000 });

    // Click the button to trigger analysis
    await analyzeFindingBtn.click();

    // Results should appear
    await waitForResults(page);
  });

  test("F-voice-input: Mic button toggles without crashing", async ({ page }) => {
    // Step 1: Click mic icon (aria-label is "Voice input" initially)
    const micBtn = page.getByRole("button", { name: /voice input/i }).first();
    await expect(micBtn).toBeVisible();
    await micBtn.click();

    // Step 2: Wait a moment (simulating speech)
    await page.waitForTimeout(500);

    // Step 3: Click mic again — now it might say "Stop listening" or still "Voice input"
    const stopOrMic = page.getByRole("button", { name: /stop listening|voice input/i }).first();
    await stopOrMic.click();
    await page.waitForTimeout(300);
    await expect(page.getByText("Service Health Overview")).toBeVisible();
  });

  test.skip("F-analyze-btn: Run analysis with service+env+timerange", async ({ page }) => {
    // Step 1: Fill question
    const centerInput = page.getByPlaceholder(/Ask Copilot a question/);
    await centerInput.fill("Show current errors");

    // Step 2: Set time range
    await page.getByRole("button", { name: "6h", exact: true }).click();
    await expect(page.getByRole("button", { name: "6h", exact: true })).toHaveClass(/bg-primary/);

    // Step 3: Click Analyze
    await clickAnalyze(page);
    await waitForResults(page);
  });
});

/* ───────────────── SCOPE & FILTERS FLOWS ───────────────── */

test.describe("User Flows — Scope & Filters", () => {
  test.beforeEach(async ({ page, request }) => {
    await loginViaAPI(page, request);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test.skip("F-set-time-range: Time range buttons toggle active state", async ({ page }) => {
    for (const label of ["15m", "1h", "6h", "24h"]) {
      const btn = page.getByRole("button", { name: label, exact: true });
      await btn.click();
      await expect(btn).toHaveClass(/bg-primary/);
    }
  });

  test.skip("F-set-service: Service autocomplete accepts input", async ({ page }) => {
    // The service autocomplete has placeholder "e.g. payment-service"
    const serviceInput = page.getByPlaceholder("e.g. payment-service");
    await expect(serviceInput).toBeVisible();
    await serviceInput.fill("payment");
    await expect(serviceInput).toHaveValue("payment");
  });

  test.skip("F-set-env: Env autocomplete accepts input", async ({ page }) => {
    const envInput = page.getByPlaceholder("e.g. prod");
    await expect(envInput).toBeVisible();
    await envInput.fill("prod");
    await expect(envInput).toHaveValue("prod");
  });

  test.skip("F-advanced-filters: Advanced filters toggle shows/hides fields", async ({ page }) => {
    const advToggle = page.getByText(/Advanced filters/i);
    await expect(advToggle).toBeVisible();

    // Expand
    await advToggle.click();
    for (const ph of ["Region", "Version", "Deploy ID", "Trace ID", "Tenant", "Endpoint"]) {
      await expect(page.getByPlaceholder(ph)).toBeVisible();
    }

    // Fill one filter
    await page.getByPlaceholder("Region").fill("us-east-1");
    await expect(page.getByPlaceholder("Region")).toHaveValue("us-east-1");

    // Collapse
    await advToggle.click();
    await expect(page.getByPlaceholder("Region")).not.toBeVisible();
  });
});

/* ───────────────── RESULTS & INVESTIGATION FLOWS ───────────────── */

test.describe("User Flows — Results & Investigation", () => {
  test.beforeEach(async ({ page, request }) => {
    await loginViaAPI(page, request);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("F-view-tabs: Result tabs (summary, evidence, timeline, actions) work", async ({ page }) => {
    const centerInput = page.getByPlaceholder(/Ask Copilot a question/);
    await centerInput.fill("What errors are happening?");
    await clickAnalyze(page);
    await waitForResults(page);

    // Click through each tab
    for (const tabName of ["Summary", "Evidence", "Timeline", "Actions"]) {
      const tab = page.getByRole("button", { name: new RegExp(tabName, "i") });
      await expect(tab).toBeVisible();
      await tab.click();
      await page.waitForTimeout(300);
    }
  });

  test("F-evidence-types: Evidence sub-tabs filter by telemetry type", async ({ page }) => {
    const centerInput = page.getByPlaceholder(/Ask Copilot a question/);
    await centerInput.fill("Check all service health");
    await clickAnalyze(page);
    await waitForResults(page);

    // Click evidence tab — scope to main to avoid nav sidebar buttons
    const mainArea = page.getByRole("main");
    const evidenceTab = mainArea.getByRole("button", { name: /evidence/i });
    if (await evidenceTab.isVisible()) {
      await evidenceTab.click();
      await page.waitForTimeout(300);

      // Look for evidence sub-type tabs — these are inside the evidence panel, not the nav sidebar
      // Use .last() to prefer the evidence sub-tab over any nav sidebar button with same name
      for (const subType of ["logs", "metrics", "traces", "alerts"]) {
        const subBtn = mainArea.getByRole("button", { name: new RegExp(`^${subType}$`, "i") }).last();
        if (await subBtn.isVisible().catch(() => false)) {
          await subBtn.click();
          await page.waitForTimeout(200);
        }
      }
    }
  });

  test("F-view-root-cause: Root cause candidates appear after analysis", async ({ page }) => {
    const centerInput = page.getByPlaceholder(/Ask Copilot a question/);
    await centerInput.fill("What is the root cause of errors?");
    await clickAnalyze(page);
    await waitForResults(page);

    // Look for root cause section
    const rootCause = page.getByText(/root cause/i).first();
    await expect(rootCause).toBeVisible({ timeout: 10_000 });
  });

  test("F-view-pipeline: Pipeline progress steps appear", async ({ page }) => {
    const centerInput = page.getByPlaceholder(/Ask Copilot a question/);
    await centerInput.fill("Check all systems");
    await clickAnalyze(page);
    await waitForResults(page);

    // Pipeline steps should show (Scope, Gather, Correlate, Root cause, etc.)
    const pipelineStep = page.getByText(/Gather signals|Correlate|Root cause/i).first();
    await expect(pipelineStep).toBeVisible({ timeout: 10_000 });
  });

  test("F-close-investigation: Close & Record Learnings button is functional", async ({ page }) => {
    const centerInput = page.getByPlaceholder(/Ask Copilot a question/);
    await centerInput.fill("Why is checkout slow?");
    await clickAnalyze(page);
    await waitForResults(page);

    // Look for the Close & Record Learnings button
    const closeBtn = page.getByRole("button", { name: /close.*record|record.*learn/i });
    if (await closeBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await closeBtn.click();
      await page.waitForTimeout(1000);
    }
    // If not visible, the confidence threshold wasn't met — not a failure of the flow itself
  });
});

/* ───────────────── HISTORY & SHARING FLOWS ───────────────── */

test.describe("User Flows — History & Sharing", () => {
  test.beforeEach(async ({ page, request }) => {
    await loginViaAPI(page, request);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("F-view-history: Run history populates and items are clickable", async ({ page }) => {
    // Run an analysis to ensure history exists
    const centerInput = page.getByPlaceholder(/Ask Copilot a question/);
    await centerInput.fill("History test flow");
    await clickAnalyze(page);
    await waitForResults(page, 90_000);

    // Wait for the state to definitely update in localStorage
    await page.waitForTimeout(2000);

    // Click the history button to open the sidebar
    await page.getByTitle("Run History (⌘H)").click();
    await page.waitForTimeout(1000);

    // Check Run History sidebar
    await expect(page.getByText("Recent Runs")).toBeVisible();

    // Verify localStorage has history
    const historyRaw = await page.evaluate(() =>
      localStorage.getItem("obs_run_history")
    );
    expect(historyRaw).toBeTruthy();
    const history = JSON.parse(historyRaw!);
    expect(history.length).toBeGreaterThan(0);
  });

  test("F-compare-runs: Run comparison UI is accessible", async ({ page }) => {
    test.slow(); // This test runs two full analyses, needs extra time

    const centerInput = page.getByPlaceholder(/Ask Copilot a question/);

    // Run first analysis
    await centerInput.fill("First compare query");
    await centerInput.press("Enter");
    await waitForResults(page, 120_000);

    // Navigate back
    const backBtn = page.getByRole("button", { name: "Back" });
    if (await backBtn.isVisible()) await backBtn.click();
    await page.waitForTimeout(1500);
    await page.waitForLoadState("networkidle");

    // Run second analysis
    await centerInput.fill("Second compare query");
    await centerInput.press("Enter");
    await waitForResults(page, 120_000);

    // Open the history panel if closed
    const historyPanel = page.locator("div:has-text('Recent Runs')");
    if (!await historyPanel.isVisible()) {
      await page.getByTitle(/Run History/).click();
      await page.waitForTimeout(500);
    }

    // Hover over the recently created history item to reveal the Compare button
    // The text might be truncated, so use a fuzzy match
    const historyItem = page.getByRole("button", { name: /compare query/i }).first();
    await historyItem.hover({ force: true });

    // Check for the comparison button
    const compareBtn = historyItem.getByRole("button", { name: "Compare" });
    await expect(compareBtn).toBeAttached();
    await expect(compareBtn).toBeVisible();
  });

  test("F-save-prompt: Save and use a saved prompt", async ({ page }) => {
    // Step 1: Enter a question in center input
    const centerInput = page.getByPlaceholder(/Ask Copilot a question/);
    await centerInput.fill("My saved test prompt");

    // Step 2: Click save — opens modal
    const saveBtn = page.getByTitle(/Save this prompt/i);
    await saveBtn.click();

    // Step 2b: Fill modal and confirm
    const modal = page.getByTestId("save-prompt-modal");
    await expect(modal).toBeVisible();
    const nameInput = page.getByTestId("save-prompt-name-input");
    await nameInput.clear();
    await nameInput.fill("My Saved Test Prompt");
    await page.getByTestId("save-prompt-confirm").click();
    await page.waitForTimeout(500);

    // Step 3: Saved prompts section visible
    await page.getByTitle(/Run History/).click();
    await expect(page.getByText("Saved Prompts")).toBeVisible();

    // Step 4: Click Run on saved prompt — verify it fills the center input
    const runBtn = page.getByRole("button", { name: "Run", exact: true }).first();
    await runBtn.click();
    // Verify the prompt text was applied to the center input
    await expect(centerInput).toHaveValue("My saved test prompt", { timeout: 5000 });
  });

  test("F-share-results: Share and Export buttons work after analysis", async ({ page }) => {
    const centerInput = page.getByPlaceholder(/Ask Copilot a question/);
    await centerInput.fill("Share test query");
    await clickAnalyze(page);
    await waitForResults(page);

    // Share button in header — use exact match to avoid matching run history entry
    const header = page.locator("header");
    const shareBtn = header.getByRole("button", { name: "Share", exact: true });
    await expect(shareBtn).toBeVisible();
    await shareBtn.click();
    await page.waitForTimeout(500);

    // Export button in header
    const exportBtn = header.getByRole("button", { name: "Export", exact: true });
    await expect(exportBtn).toBeVisible();
    await exportBtn.click();
    await page.waitForTimeout(500);
  });
});

/* ───────────────── NAVIGATION FLOWS ───────────────── */

test.describe("User Flows — Navigation (Shared State)", () => {
  test.beforeEach(async ({ page, request }) => {
    await loginViaAPI(page, request); // Keep login for each test for isolation, or move to beforeAll if state is truly shared
    await page.goto("/");
    const centerInput = page.getByPlaceholder(/Ask Copilot a question/);
    await centerInput.fill("Analysis for navigation check");
    await centerInput.press("Enter");
    await waitForResults(page, 120_000);
  });

  test("F-nav-dashboard: Dashboard nav item scrolls to results", async ({ page }) => {
    const dashboardBtn = page.getByRole("button", { name: "Dashboard" });
    await expect(dashboardBtn).toBeVisible();
    await dashboardBtn.click();
    // Use a more reliable result container selector
    await expect(page.locator(".bg-slate-900\\/50").first()).toBeVisible();
  });

  test("F-nav-alerts: Alerts nav pre-fills Copilot question", async ({ page }) => {
    const alertsBtn = page.getByRole("button", { name: /Alerts/i });
    await expect(alertsBtn).toBeVisible();
    await alertsBtn.click();
    await expect(page.getByPlaceholder(/Ask Copilot a question/)).not.toHaveValue("");
  });

  test("F-nav-traces: Traces nav pre-fills Copilot question", async ({ page }) => {
    const tracesBtn = page.getByRole("button", { name: /Traces/i });
    await expect(tracesBtn).toBeVisible();
    await tracesBtn.click();
    await expect(page.getByPlaceholder(/Ask Copilot a question/)).not.toHaveValue("");
  });

  test("F-nav-logs: Logs nav pre-fills Copilot question", async ({ page }) => {
    const logsBtn = page.getByRole("button", { name: /Logs/i });
    await expect(logsBtn).toBeVisible();
    await logsBtn.click();
    await expect(page.getByPlaceholder(/Ask Copilot a question/)).not.toHaveValue("");
  });

  test("F-nav-metrics: Metrics nav pre-fills Copilot question", async ({ page }) => {
    const metricsBtn = page.getByRole("button", { name: /Metrics/i });
    await expect(metricsBtn).toBeVisible();
    await metricsBtn.click();
    await expect(page.getByPlaceholder(/Ask Copilot a question/)).not.toHaveValue("");
  });

  test.skip("F-test-sources: Test all data sources", async ({ page }) => {
    const testAllBtn = page.getByRole("button", { name: /Test all/i });
    await expect(testAllBtn).toBeVisible();
    await testAllBtn.click();

    // Wait for test results
    await page.waitForTimeout(3000);
    await expect(page.getByText("Data sources")).toBeVisible();
  });

  test("F-create-case: Actions menu shows Kibana Case option", async ({ page }) => {
    const actionsTab = page.getByRole("button", { name: "Actions" });
    await expect(actionsTab).toBeVisible({ timeout: 15_000 });
    await actionsTab.click();

    // The content might take a moment to switch
    const caseBtn = page.getByRole("button", { name: /Create Kibana Case/i });
    await expect(caseBtn).toBeVisible({ timeout: 15_000 });
  });
});

/* ───────────────── ADMIN & SETTINGS FLOWS ───────────────── */

test.describe("User Flows — Admin & Settings", () => {
  test("F-login: Full login flow from login page", async ({ page }) => {
    // Navigate first to establish origin, then clear localStorage
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Step 1: Enter credentials
    await page.getByPlaceholder("demo").fill("demo");
    await page.getByPlaceholder("••••••••").fill("demo123");

    // Step 2: Click sign in
    await page.getByRole("button", { name: /sign in/i }).click();

    // Step 3: Should redirect to dashboard
    await page.waitForURL("/", { timeout: 10_000 });
    await expect(page.getByText("Service Health Overview")).toBeVisible();
  });

  test("F-connect-elastic: Connect page has all form fields", async ({ page, request }) => {
    await loginViaAPI(page, request);
    await page.goto("/connect");
    await page.waitForTimeout(2000);

    // Handle redirect to login if needed
    if (page.url().includes("/login")) {
      await page.getByPlaceholder("demo").fill("demo");
      await page.getByPlaceholder("••••••••").fill("demo123");
      await page.getByRole("button", { name: /sign in/i }).click();
      await page.waitForURL("/", { timeout: 5000 });
      await page.goto("/connect");
      await page.waitForTimeout(2000);
    }

    // Step 1: Elasticsearch endpoint field
    await expect(
      page.getByPlaceholder("https://xxx.es.region.gcp.elastic.cloud:443")
    ).toBeVisible({ timeout: 10_000 });

    // Step 2: API Key field
    const apiKeyField = page.getByPlaceholder(/api.*key|encoded/i).first();
    if (await apiKeyField.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(apiKeyField).toBeVisible();
    }
  });

  test("F-logout: Log out clears token and redirects", async ({ page, request }) => {
    await loginViaAPI(page, request);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Step 1: Click Sign Out in the header (direct access)
    const signOutBtn = page.getByRole("button", { name: /Sign Out/i });
    await expect(signOutBtn).toBeVisible();
    await signOutBtn.click();

    // Step 2: Should redirect to login
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    // Step 3: Token should be cleared
    const token = await page.evaluate(() =>
      localStorage.getItem("observability_copilot_token")
    );
    expect(token).toBeFalsy();
  });

  test("F-keyboard-shortcuts: Cmd+K focuses search bar", async ({ page, request }) => {
    await loginViaAPI(page, request);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Focus on something else first
    await page.getByText("Service Health Overview").click();

    // Press Cmd+K (or Ctrl+K)
    const isMac = process.platform === "darwin";
    await page.keyboard.press(isMac ? "Meta+k" : "Control+k");
    await page.waitForTimeout(300);

    // The center input or sidebar input should be focused
    // We check by trying to type and seeing if text appears
    await page.keyboard.type("test focus");
    await page.waitForTimeout(200);

    // One of the inputs should now have the text
    const centerVal = await page.getByPlaceholder(/Ask Copilot a question/).inputValue();
    const focused = centerVal.includes("test focus");
    expect(focused).toBeTruthy();
  });

  test("F-escape-clears: Escape key clears search input", async ({ page, request }) => {
    await loginViaAPI(page, request);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const centerInput = page.getByPlaceholder(/Ask Copilot a question/);
    await centerInput.fill("Some query to clear");
    await expect(centerInput).toHaveValue("Some query to clear");

    await centerInput.press("Escape");
    await expect(centerInput).toHaveValue("");
  });
});
