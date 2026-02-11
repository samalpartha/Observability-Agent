"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken, setAuth } from "../lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8765";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getToken()) router.replace("/");
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const contentType = res.headers.get("content-type");
      const isJson = contentType && contentType.includes("application/json");
      const data = isJson ? await res.json().catch(() => ({})) : {};

      if (!res.ok) {
        const msg = Array.isArray(data.detail)
          ? data.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(" ") || "Login failed"
          : (data.detail || "Login failed");
        if (res.status === 503) {
          setError("Server: login not configured. Ask admin to set DEMO_PASSWORD in backend .env.");
          return;
        }
        if (res.status === 401) {
          setError("Invalid username or password. Use demo / demo123.");
          return;
        }
        setError(String(msg));
        return;
      }

      const token = data.access_token;
      const user = data.username || username.trim();
      if (!token) {
        setError("Server did not return a token.");
        return;
      }
      setAuth(token, user);
      router.push("/");
      router.refresh();
    } catch (err) {
      if (err instanceof TypeError && (err.message.includes("fetch") || err.message.includes("Failed to fetch"))) {
        setError("Cannot reach the API. Is the backend running? Set NEXT_PUBLIC_API_URL in frontend .env.local (e.g. http://127.0.0.1:8765).");
      } else {
        setError(err instanceof Error ? err.message : "Login failed");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Observability Copilot</h1>
          <p className="text-slate-400 text-sm mt-1">Sign in to continue</p>
        </div>
        <form onSubmit={handleSubmit} className="rounded-2xl bg-slate-800/60 border border-slate-700 p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="demo"
              className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
              required
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
              required
              autoComplete="current-password"
            />
          </div>
          {error && (
            <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 font-medium text-white transition"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="text-center text-slate-500 text-xs mt-6">
          Demo: <strong className="text-slate-400">demo</strong> / <strong className="text-slate-400">demo123</strong>
        </p>
      </div>
    </div>
  );
}
