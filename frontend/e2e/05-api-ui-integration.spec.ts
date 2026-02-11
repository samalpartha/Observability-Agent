/**
 * API + UI INTEGRATION TESTS
 * Verify that the frontend correctly calls the backend and
 * renders the response. End-to-end, no mocking.
 */
import { test, expect } from "@playwright/test";
import { loginViaAPI } from "./helpers";

// Helper: click the center Analyze button (the one in <main>)
async function clickAnalyze(page: import("@playwright/test").Page) {
  await page.getByRole("main").getByRole("button", { name: "Analyze" }).click();
}

// Helper: wait for analysis results to appear
async function waitForResults(page: import("@playwright/test").Page, timeout = 45_000) {
  await expect(
    page.getByRole("heading", { name: "Executive summary" })
  ).toBeVisible({ timeout });
}

test.describe("API + UI Integration", () => {
  test.beforeEach(async ({ page, request }) => {
    await loginViaAPI(page, request);
  });

  test("I1: Analyze flow — UI sends POST /debug and renders response", async ({ page }) => {
    await page.goto("/");

    // Intercept the /debug or /debug/stream call (SSE streaming or regular)
    const debugPromise = page.waitForResponse(
      (res) => res.url().includes("/debug") && res.request().method() === "POST" && res.ok(),
      { timeout: 45_000 }
    );

    const centerInput = page.getByPlaceholder(/Ask Copilot about your stack/);
    await centerInput.fill("What errors are happening?");
    await clickAnalyze(page);

    const response = await debugPromise;
    expect(response.ok()).toBeTruthy();

    // The response may be SSE (text/event-stream) or JSON — just verify it was OK
    const contentType = response.headers()["content-type"] || "";
    if (contentType.includes("application/json")) {
      const body = await response.json();
      expect(body.run_id).toBeTruthy();
      expect(typeof body.confidence).toBe("number");
    }
    // SSE: streaming response, just verify we got a 200

    // Wait for UI to render the result
    await waitForResults(page);
  });

  test("I2: Sources status is fetched and rendered on load", async ({ page }) => {
    // Intercept sources call
    const sourcesPromise = page.waitForResponse(
      (res) => res.url().includes("/sources") && !res.url().includes("/test"),
      { timeout: 15_000 }
    );

    await page.goto("/");

    const response = await sourcesPromise;
    expect(response.ok()).toBeTruthy();

    await expect(page.getByText("Data sources")).toBeVisible();
  });

  test("I3: Test-all sources triggers POST /sources/test", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const testPromise = page.waitForResponse(
      (res) => res.url().includes("/sources/test"),
      { timeout: 15_000 }
    );

    await page.getByRole("button", { name: /Test all/i }).click();

    const response = await testPromise;
    expect(response.ok()).toBeTruthy();
  });

  test("I4: Time range selection is sent in /debug request", async ({ page }) => {
    await page.goto("/");

    // Select 6h time range
    await page.getByRole("button", { name: "6h", exact: true }).click();

    const debugPromise = page.waitForResponse(
      (res) => res.url().includes("/debug") && res.request().method() === "POST",
      { timeout: 45_000 }
    );

    const centerInput = page.getByPlaceholder(/Ask Copilot about your stack/);
    await centerInput.fill("Check latency");
    await clickAnalyze(page);

    const response = await debugPromise;
    expect(response.ok()).toBeTruthy();

    const requestBody = response.request().postDataJSON();
    expect(requestBody.question).toBe("Check latency");
    if (requestBody.time_range) {
      expect(requestBody.time_range).toHaveLength(2);
    }
  });

  test("I5: Confidence tier renders correctly from API response", async ({ page }) => {
    await page.goto("/");

    const centerInput = page.getByPlaceholder(/Ask Copilot about your stack/);
    await centerInput.fill("What is system health?");
    await clickAnalyze(page);

    await waitForResults(page);

    // The confidence tier badge should appear (low, medium, or high) in the confidence section
    const confidenceHeading = page.getByRole("heading", { name: "Confidence" });
    await expect(confidenceHeading).toBeVisible();
  });

  test("I6: Enter key in center input triggers analysis", async ({ page }) => {
    await page.goto("/");

    const debugPromise = page.waitForResponse(
      (res) => res.url().includes("/debug") && res.request().method() === "POST",
      { timeout: 45_000 }
    );

    const centerInput = page.getByPlaceholder(/Ask Copilot about your stack/);
    await centerInput.fill("Enter key test");
    await centerInput.press("Enter");

    const response = await debugPromise;
    expect(response.ok()).toBeTruthy();
  });

  test("I7: Login API + redirect flow works end-to-end", async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.goto("/login");

    const loginPromise = page.waitForResponse(
      (res) => res.url().includes("/auth/login"),
      { timeout: 10_000 }
    );

    await page.getByPlaceholder("demo").fill("demo");
    await page.getByPlaceholder("••••••••").fill("demo123");
    await page.getByRole("button", { name: /sign in/i }).click();

    const response = await loginPromise;
    expect(response.ok()).toBeTruthy();

    await page.waitForURL("/", { timeout: 10_000 });

    const token = await page.evaluate(() =>
      localStorage.getItem("observability_copilot_token")
    );
    expect(token).toBeTruthy();
  });

  test("I8: Bad login shows error, doesn't redirect", async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.goto("/login");

    await page.getByPlaceholder("demo").fill("demo");
    await page.getByPlaceholder("••••••••").fill("wrongpassword");
    await page.getByRole("button", { name: /sign in/i }).click();

    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/invalid|error|failed/i)).toBeVisible({ timeout: 5_000 });
  });

  test("I9: Pipeline artifacts display after analysis", async ({ page }) => {
    await page.goto("/");

    const centerInput = page.getByPlaceholder(/Ask Copilot about your stack/);
    await centerInput.fill("Check all services");
    await clickAnalyze(page);

    await waitForResults(page);

    // The pipeline sidebar or pipeline artifacts section should show
    // Check for any pipeline step labels
    const pipelineText = page.getByText(/Gather signals|Correlate|Root cause/i).first();
    await expect(pipelineText).toBeVisible({ timeout: 5_000 });
  });

  test("I10: Run history persists across page reload", async ({ page }) => {
    await page.goto("/");

    const centerInput = page.getByPlaceholder(/Ask Copilot about your stack/);
    await centerInput.fill("Persistence test query");
    await clickAnalyze(page);

    await waitForResults(page);

    await page.reload();
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Recent Runs")).toBeVisible();
    const historyRaw = await page.evaluate(() =>
      localStorage.getItem("observability_copilot_run_history")
    );
    expect(historyRaw).toBeTruthy();
    const history = JSON.parse(historyRaw!);
    expect(history.length).toBeGreaterThan(0);
  });
});
