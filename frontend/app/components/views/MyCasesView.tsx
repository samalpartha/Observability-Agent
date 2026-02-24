"use client";
/**
 * MyCasesView — shows Kibana Cases created from within this app.
 * Displayed as a sub-tab inside the Actions tab → Operations section.
 */
import { useEffect, useState, useCallback } from "react";
import { useObservabilityApi } from "../../hooks/useObservabilityApi";

interface KibanaCase {
    id: string;
    title: string;
    status: "open" | "closed" | "in-progress";
    created_at: string;
    updated_at: string;
    url?: string;
}

export function MyCasesView() {
    const { fetchWithAuth } = useObservabilityApi();
    const [cases, setCases] = useState<KibanaCase[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchCases = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetchWithAuth("/cases", { method: "GET" });
            if (!res || !res.ok) {
                const text = await res?.text();
                throw new Error(text || "Failed to fetch cases");
            }
            const data = await res.json();
            setCases(data.cases || []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load cases");
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth]);

    useEffect(() => { fetchCases(); }, [fetchCases]);

    const statusBadge = (status: string) => {
        const map: Record<string, string> = {
            open: "bg-red-500/20 text-red-400 border-red-500/30",
            "in-progress": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
            closed: "bg-green-500/20 text-green-400 border-green-500/30",
        };
        return map[status] ?? "bg-slate-500/20 text-slate-400 border-slate-500/30";
    };

    const kibanaBase = process.env.NEXT_PUBLIC_KIBANA_URL ?? "";

    if (loading) {
        return (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-500 text-sm">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading cases from Kibana…
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-xl border border-red-500/20 bg-red-950/10 p-4 text-sm text-red-400 flex items-center gap-3">
                <span>⚠️</span>
                <span>{error}</span>
                <button
                    onClick={fetchCases}
                    className="ml-auto text-xs underline hover:text-red-300"
                >
                    Retry
                </button>
            </div>
        );
    }

    if (cases.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-slate-500">
                <span className="text-3xl">📂</span>
                <p className="text-sm">No cases yet. Create one from an active investigation.</p>
                <button
                    onClick={fetchCases}
                    className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                >
                    Refresh
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">{cases.length} case{cases.length !== 1 ? "s" : ""} found in Kibana</p>
                <button
                    onClick={fetchCases}
                    className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                >
                    Refresh
                </button>
            </div>
            {cases.map((c) => (
                <div
                    key={c.id}
                    className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-4 flex items-start gap-3 hover:border-slate-600/50 transition-colors"
                >
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-200 truncate">{c.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Opened {new Date(c.created_at).toLocaleString()} · Updated {new Date(c.updated_at).toLocaleString()}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${statusBadge(c.status)}`}>
                            {c.status}
                        </span>
                        {kibanaBase && (
                            <a
                                href={`${kibanaBase}/app/observability/cases/${c.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                            >
                                View ↗
                            </a>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
