/**
 * API TESTS — Validate every backend endpoint with real HTTP calls.
 * No mocking. These hit the live backend at API_URL.
 */
import { test, expect } from "@playwright/test";
import { getAuthToken, authedGet, authedPost, API_URL } from "./helpers";

let token: string;

test.beforeAll(async ({ request }) => {
  token = await getAuthToken(request);
});

test.describe("Auth API", () => {
  test("A1: POST /auth/login with valid credentials returns token", async ({ request }) => {
    const res = await request.post(`${API_URL}/auth/login`, {
      data: { username: "demo", password: "demo123" },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.access_token).toBeTruthy();
    expect(body.token_type).toBe("bearer");
    expect(body.username).toBe("demo");
  });

  test("A2: POST /auth/login with bad password returns 401", async ({ request }) => {
    const res = await request.post(`${API_URL}/auth/login`, {
      data: { username: "demo", password: "wrongpassword" },
    });
    expect(res.status()).toBe(401);
  });

  test("A3: POST /auth/login with empty username returns 422", async ({ request }) => {
    const res = await request.post(`${API_URL}/auth/login`, {
      data: { username: "", password: "demo123" },
    });
    expect(res.status()).toBe(422);
  });

  test("A4: POST /auth/logout returns ok", async ({ request }) => {
    const res = await request.post(`${API_URL}/auth/logout`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

test.describe("Health API", () => {
  test("A5: GET /health returns status", async ({ request }) => {
    const res = await request.get(`${API_URL}/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBeDefined();
    expect(["ok", "degraded", "error"]).toContain(body.status);
  });
});

test.describe("Sources API", () => {
  test("A6: GET /sources requires auth", async ({ request }) => {
    const res = await request.get(`${API_URL}/sources`);
    expect(res.status()).toBe(401);
  });

  test("A7: GET /sources with auth returns sources array", async ({ request }) => {
    const res = await authedGet(request, token, "/sources");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.sources).toBeDefined();
    expect(Array.isArray(body.sources)).toBe(true);
    expect(body.sources.length).toBeGreaterThanOrEqual(5);
    for (const src of body.sources) {
      expect(src.id).toBeDefined();
      expect(src.label).toBeDefined();
      expect(["connected", "degraded", "disconnected"]).toContain(src.status);
    }
  });

  test("A8: POST /sources/test with auth returns connection status", async ({ request }) => {
    const res = await authedPost(request, token, "/sources/test");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(typeof body.ok).toBe("boolean");
  });

  test("A9: POST /sources/test?source=logs tests specific source", async ({ request }) => {
    const res = await request.post(`${API_URL}/sources/test?source=logs`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.source).toBe("logs");
    expect(["connected", "degraded", "disconnected"]).toContain(body.status);
  });
});

test.describe("Connection API", () => {
  test("A10: GET /connection requires auth", async ({ request }) => {
    const res = await request.get(`${API_URL}/connection`);
    expect(res.status()).toBe(401);
  });

  test("A11: GET /connection with auth returns config", async ({ request }) => {
    const res = await authedGet(request, token, "/connection");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(typeof body.configured).toBe("boolean");
    expect(body).toHaveProperty("elastic_url");
    expect(body).toHaveProperty("kibana_url");
    expect(body).toHaveProperty("space");
  });
});

test.describe("Scope API", () => {
  test("A12: GET /scope requires auth", async ({ request }) => {
    const res = await request.get(`${API_URL}/scope`);
    expect(res.status()).toBe(401);
  });

  test("A13: GET /scope with auth returns services and envs", async ({ request }) => {
    const res = await authedGet(request, token, "/scope");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty("services");
    expect(body).toHaveProperty("envs");
    expect(Array.isArray(body.services)).toBe(true);
    expect(Array.isArray(body.envs)).toBe(true);
  });
});

test.describe("Debug API", () => {
  test("A14: POST /debug requires auth", async ({ request }) => {
    const res = await request.post(`${API_URL}/debug`, {
      data: { question: "test" },
    });
    expect(res.status()).toBe(401);
  });

  test("A15: POST /debug with empty question returns 422", async ({ request }) => {
    const res = await request.post(`${API_URL}/debug`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { question: "" },
    });
    expect(res.status()).toBe(422);
  });

  test("A16: POST /debug with valid question returns DebugResponse", async ({ request }) => {
    const res = await request.post(`${API_URL}/debug`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { question: "What is the current system health?", service: "", env: "" },
      timeout: 45_000,
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    // Structural validation
    expect(body.run_id).toBeTruthy();
    expect(body.status).toBeDefined();
    expect(typeof body.confidence).toBe("number");
    expect(body.confidence).toBeGreaterThanOrEqual(0);
    expect(body.confidence).toBeLessThanOrEqual(1);
    expect(Array.isArray(body.executive_summary)).toBe(true);
    expect(Array.isArray(body.findings)).toBe(true);
    expect(Array.isArray(body.proposed_fixes)).toBe(true);
    expect(Array.isArray(body.confidence_reasons)).toBe(true);
    expect(Array.isArray(body.root_cause_candidates)).toBe(true);
    expect(typeof body.scope).toBe("object");

    // New functional fields
    expect(body.confidence_tier).toBeDefined();
    expect(["low", "medium", "high"]).toContain(body.confidence_tier);
    expect(Array.isArray(body.next_steps)).toBe(true);
    expect(typeof body.signal_contributions).toBe("object");
    expect(typeof body.attempt_number).toBe("number");
    expect(typeof body.attempt_message).toBe("string");
    expect(Array.isArray(body.missing_signals)).toBe(true);
    expect(typeof body.pipeline_artifacts).toBe("object");
    expect(Array.isArray(body.root_cause_states)).toBe(true);
    expect(typeof body.run_delta).toBe("object");
  });

  test("A17: POST /debug with service filter returns scoped results", async ({ request }) => {
    const res = await request.post(`${API_URL}/debug`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { question: "Check for errors", service: "gateway-api" },
      timeout: 45_000,
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.scope.service).toBe("gateway-api");
  });
});

test.describe("Debug Close / Closures API", () => {
  test("A18: POST /debug/close stores closure", async ({ request }) => {
    const res = await authedPost(request, token, "/debug/close", {
      run_id: "test-run-api",
      root_cause: "DB connection pool exhaustion",
      signals_used: ["logs_error_burst", "latency_anomaly"],
      false_leads: ["CPU spike was coincidental"],
      resolution_time_seconds: 1200,
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    // Actual response: {status: "ok", message: "Closure recorded..."}
    expect(body.status).toBe("ok");
    expect(body.message).toContain("Closure recorded");
  });

  test("A19: GET /debug/closures returns stored closures", async ({ request }) => {
    const res = await authedGet(request, token, "/debug/closures");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    // Actual response: {closures: [{run_id, root_cause, ...}, ...]}
    expect(body.closures).toBeDefined();
    expect(Array.isArray(body.closures)).toBe(true);
    // Should have at least the closure from the previous test
    const found = body.closures.find((c: { run_id: string }) => c.run_id === "test-run-api");
    expect(found).toBeDefined();
    expect(found.root_cause).toBe("DB connection pool exhaustion");
  });
});

test.describe("Dashboard API", () => {
  test("A20: GET /investigations requires auth", async ({ request }) => {
    const res = await request.get(`${API_URL}/investigations`);
    expect(res.status()).toBe(401);
  });

  test("A21: GET /investigations with auth returns data", async ({ request }) => {
    const res = await authedGet(request, token, "/investigations");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body) || body.investigations !== undefined).toBeTruthy();
  });

  test("A22: GET /service-health requires auth", async ({ request }) => {
    const res = await request.get(`${API_URL}/service-health`);
    expect(res.status()).toBe(401);
  });

  test("A23: GET /service-health with auth returns data", async ({ request }) => {
    const res = await authedGet(request, token, "/service-health");
    expect(res.ok()).toBeTruthy();
  });

  test("A24: GET /findings/recent requires auth", async ({ request }) => {
    const res = await request.get(`${API_URL}/findings/recent`);
    expect(res.status()).toBe(401);
  });

  test("A25: GET /findings/recent with auth returns data", async ({ request }) => {
    const res = await authedGet(request, token, "/findings/recent");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body) || body.findings !== undefined).toBeTruthy();
  });
});

test.describe("Cases API", () => {
  test("A26: POST /cases requires auth", async ({ request }) => {
    const res = await request.post(`${API_URL}/cases`, {
      data: { title: "Test case" },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe("Auth Edge Cases", () => {
  test("A27: Expired/invalid token returns 401 on protected endpoint", async ({ request }) => {
    const res = await request.get(`${API_URL}/sources`, {
      headers: { Authorization: "Bearer invalid-token-12345" },
    });
    expect(res.status()).toBe(401);
  });

  test("A28: Missing Authorization header returns 401", async ({ request }) => {
    const res = await request.get(`${API_URL}/sources`);
    expect(res.status()).toBe(401);
  });
});
