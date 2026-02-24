/**
 * Playwright auth setup — logs in once and saves storage state.
 * All E2E specs depend on this so they start from an authenticated session.
 */
import { test as setup, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const AUTH_FILE = path.join(__dirname, "auth.json");

setup("authenticate", async ({ page }) => {
    await page.goto("/login");

    await page.fill('input[name="username"], input[type="text"]', "demo");
    await page.fill('input[name="password"], input[type="password"]', "demo123");
    await page.click('button[type="submit"]');

    // Wait until redirected to main app (not the login page)
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
        timeout: 15_000,
    });

    // Also inject the JWT into localStorage for API calls
    const token = await page.evaluate(async () => {
        const res = await fetch("http://localhost:8765/auth/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: "demo", password: "demo123" }),
        });
        const data = await res.json();
        const t = data.access_token || data.token || "";
        if (t) localStorage.setItem("obs_token", t);
        return t;
    });

    if (!token) {
        console.warn("[auth.setup] Could not obtain JWT — API calls may fail in E2E tests");
    }

    await page.context().storageState({ path: AUTH_FILE });
});
