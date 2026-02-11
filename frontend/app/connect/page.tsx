"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getToken } from "../lib/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8765";

export default function ConnectPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [elasticUrl, setElasticUrl] = useState("");
  const [kibanaUrl, setKibanaUrl] = useState("");
  const [space, setSpace] = useState("default");
  const [apiKey, setApiKey] = useState("");
  const [timeZone, setTimeZone] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saveInstructions, setSaveInstructions] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !getToken()) return;
    fetch(`${API_URL}/connection`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data: { elastic_url?: string; kibana_url?: string; space?: string }) => {
        if (data.elastic_url) setElasticUrl(data.elastic_url);
        if (data.kibana_url) setKibanaUrl(data.kibana_url);
        if (data.space) setSpace(data.space);
      })
      .catch(() => {});
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    if (!getToken()) router.replace("/login");
  }, [mounted, router]);

  async function handleTest() {
    setTestResult(null);
    setTesting(true);
    try {
      const res = await fetch(`${API_URL}/connection/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          elastic_url: elasticUrl.trim(),
          kibana_url: kibanaUrl.trim() || undefined,
          space: space.trim() || "default",
          api_key: apiKey.trim(),
        }),
      });
      const data = res.ok ? await res.json() : {};
      if (data.ok) {
        setTestResult({ ok: true, message: `Connected · ${data.cluster_name || "Elastic"}` });
      } else {
        setTestResult({ ok: false, message: data.error || "Connection failed" });
      }
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setTesting(false);
    }
  }

  function handleSave() {
    if (!elasticUrl.trim() || !apiKey.trim()) {
      setSaveInstructions("Fill Elasticsearch URL and API key, then Test first.");
      return;
    }
    const lines = [
      "# Add these to your backend .env file, then restart the backend.",
      "",
      `ELASTIC_URL=${elasticUrl.trim()}`,
      `ELASTIC_API_KEY=${apiKey.trim().slice(0, 8)}... (your full key — never commit .env)`,
    ];
    if (kibanaUrl.trim()) lines.push(`KIBANA_URL=${kibanaUrl.trim()}`);
    if (space.trim() && space !== "default") lines.push(`ELASTIC_SPACE_ID=${space.trim()}`);
    if (timeZone.trim()) lines.push(`# Default time zone: ${timeZone.trim()}`);
    setSaveInstructions(lines.join("\n"));
  }

  if (!mounted || !getToken()) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-slate-400">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col">
      <header className="border-b border-slate-800 bg-slate-900/95">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="text-body text-slate-400 hover:text-white">
            ← Back
          </Link>
          <h1 className="text-title text-white">Connect Elastic Cloud</h1>
          <span className="w-12" />
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-8">
        <p className="text-body text-slate-400 mb-6">
          From your Elastic Cloud console: copy the Elasticsearch and Kibana URLs, create an API key with read access to your indices and APM, then Test and Save.
        </p>

        <div className="card border border-slate-700 space-y-4">
          <h2 className="text-section text-slate-200">Connection</h2>

          <div>
            <label className="block text-caption text-slate-400 mb-1">Elasticsearch endpoint</label>
            <input
              type="url"
              value={elasticUrl}
              onChange={(e) => setElasticUrl(e.target.value)}
              placeholder="https://xxx.es.region.gcp.elastic.cloud:443"
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-body text-white placeholder-slate-500"
            />
          </div>

          <div>
            <label className="block text-caption text-slate-400 mb-1">Kibana endpoint</label>
            <input
              type="url"
              value={kibanaUrl}
              onChange={(e) => setKibanaUrl(e.target.value)}
              placeholder="https://xxx.kb.region.gcp.elastic.cloud"
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-body text-white placeholder-slate-500"
            />
            <p className="text-caption text-slate-500 mt-1">Used for deep links (Discover, APM). Optional but recommended.</p>
          </div>

          <div>
            <label className="block text-caption text-slate-400 mb-1">Space</label>
            <input
              type="text"
              value={space}
              onChange={(e) => setSpace(e.target.value)}
              placeholder="default"
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-body text-white placeholder-slate-500"
            />
          </div>

          <div>
            <label className="block text-caption text-slate-400 mb-1">API key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Base64 API key from Cloud console"
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-body text-white placeholder-slate-500"
            />
            <p className="text-caption text-slate-500 mt-1">Stored server-side only. Minimum: read on indices, APM, alerts.</p>
          </div>

          <div>
            <label className="block text-caption text-slate-400 mb-1">Default time zone (optional)</label>
            <input
              type="text"
              value={timeZone}
              onChange={(e) => setTimeZone(e.target.value)}
              placeholder="e.g. UTC or America/New_York"
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-body text-white placeholder-slate-500"
            />
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || !elasticUrl.trim() || !apiKey.trim()}
              className="px-4 py-2 rounded-lg bg-sky-600 text-white font-medium hover:bg-sky-500 disabled:opacity-50"
            >
              {testing ? "Testing…" : "Test connection"}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded-lg border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"
            >
              Save
            </button>
          </div>

          {testResult && (
            <div className={`p-3 rounded-lg ${testResult.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
              {testResult.message}
            </div>
          )}

          {saveInstructions && (
            <div className="p-4 rounded-lg bg-slate-800 border border-slate-600">
              <p className="text-caption text-slate-400 mb-2">Add these to your backend .env file, then restart the backend. API key is never shown here.</p>
              <pre className="text-caption text-slate-300 whitespace-pre-wrap font-mono">{saveInstructions}</pre>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
