/**
 * Shared test helpers — auth, API calls, constants.
 * No mocking, no fakes. These hit the REAL running servers.
 */
import { type Page, type APIRequestContext, expect } from "@playwright/test";

export const API_URL = process.env.API_URL ?? "http://127.0.0.1:8765";
export const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3001";

// Demo credentials from .env
const DEMO_USER = "demo";
const DEMO_PASSWORD = "demo123";

// localStorage keys used by the app
const TOKEN_KEY = "observability_copilot_token";
const USER_KEY = "observability_copilot_user";

/**
 * Obtain a real JWT token from the backend.
 */
export async function getAuthToken(request: APIRequestContext): Promise<string> {
  const res = await request.post(`${API_URL}/auth/login`, {
    data: { username: DEMO_USER, password: DEMO_PASSWORD },
  });
  expect(res.ok(), `Login failed: ${res.status()}`).toBeTruthy();
  const body = await res.json();
  expect(body.access_token).toBeTruthy();
  return body.access_token;
}

/**
 * Inject a real auth token into the browser's localStorage
 * so the app thinks the user is logged in.
 * Must be called AFTER page.goto() to a page on the same origin.
 */
export async function injectAuth(page: Page, token: string) {
  await page.evaluate(
    ({ tk, uk, user }) => {
      localStorage.setItem(tk, user.token);
      localStorage.setItem(uk, user.username);
    },
    { tk: TOKEN_KEY, uk: USER_KEY, user: { token, username: DEMO_USER } }
  );
}

/**
 * Full login flow: get token from API, inject into browser, reload page.
 * Clears run history to prevent auto-run race conditions in tests.
 */
export async function loginViaAPI(page: Page, request: APIRequestContext) {
  const token = await getAuthToken(request);
  // Navigate to any page first to establish origin
  await page.goto("/");
  // Clear any stale run history to prevent auto-run
  await page.evaluate(() => {
    localStorage.removeItem("obs_run_history");
    localStorage.removeItem("obs_saved_prompts");
  });
  await injectAuth(page, token);
  // Reload so the app reads the token
  await page.reload();
  // Wait for the app to be fully mounted
  await page.waitForLoadState("networkidle");
  return token;
}

/**
 * Make an authenticated API request.
 */
export async function authedGet(request: APIRequestContext, token: string, path: string) {
  return request.get(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function authedPost(
  request: APIRequestContext,
  token: string,
  path: string,
  data?: Record<string, unknown>
) {
  return request.post(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
}
