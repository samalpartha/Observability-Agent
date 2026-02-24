"use client";

import React, { useState } from "react";
import { SparklesIcon, SendIcon, LoaderIcon, ShieldCheckIcon, AlertTriangleIcon, SearchIcon } from "../Icons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useObservabilityApi } from "../../hooks/useObservabilityApi";

interface Reflection {
    status: string;
    criticism: string;
    modifier: number;
}

interface AIResponse {
    response: string;
    reflection?: Reflection;
    trace?: string[];
    error?: string;
}

export function AIDataExplorer() {
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<AIResponse | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const { fetchWithAuth } = useObservabilityApi();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        setLoading(true);
        setData(null);
        setErrorMsg(null);

        try {
            const res = await fetchWithAuth("/api/analytics/ai-query", {
                method: "POST",
                body: JSON.stringify({ query }),
            });

            if (!res) return; // Auth redirect handled

            const result: AIResponse = await res.json();

            if (!res.ok) {
                setErrorMsg(result.error || `Server error: ${res.status}`);
            } else {
                setData(result);
            }
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : "Unable to connect to AI assistant");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-full flex flex-col space-y-6 max-w-5xl mx-auto w-full p-4">
            <Card className="border-none bg-gradient-to-br from-indigo-500/10 to-purple-500/10 backdrop-blur-xl">
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/20 rounded-lg">
                            <SparklesIcon className="w-6 h-6 text-indigo-400" />
                        </div>
                        <div>
                            <CardTitle className="text-2xl font-bold tracking-tight">AI Data Explorer</CardTitle>
                            <CardDescription className="text-indigo-200/60">
                                Global observability intelligence. Natural language querying across logs, metrics, and traces.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="relative group">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                            <SearchIcon className="w-5 h-5 text-indigo-400/50 group-focus-within:text-indigo-400 transition-colors" />
                        </div>
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Ask about error trends, latency anomalies, or service health..."
                            className="w-full pl-12 pr-32 py-4 bg-black/40 border border-white/10 rounded-2xl text-white placeholder:text-indigo-200/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all shadow-2xl"
                            disabled={loading}
                        />
                        <div className="absolute inset-y-2 right-2 flex items-center">
                            <Button
                                type="submit"
                                disabled={loading || !query.trim()}
                                className="bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl px-6 h-full font-semibold shadow-lg shadow-indigo-500/20"
                            >
                                {loading ? (
                                    <LoaderIcon className="w-5 h-5 animate-spin" />
                                ) : (
                                    <>
                                        <SendIcon className="w-4 h-4 mr-2" />
                                        Ask AI
                                    </>
                                )}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            {/* Error state */}
            {errorMsg && (
                <Card className="border-red-500/30 bg-red-500/10">
                    <CardContent className="p-4 flex items-center gap-3">
                        <AlertTriangleIcon className="w-5 h-5 text-red-400 flex-shrink-0" />
                        <p className="text-red-300 text-sm">{errorMsg}</p>
                    </CardContent>
                </Card>
            )}

            {data && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <Card className="md:col-span-2 border-white/5 bg-black/20 overflow-hidden">
                        <CardHeader className="border-b border-white/5 bg-white/5">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <ShieldCheckIcon className="w-5 h-5 text-indigo-400" />
                                Analysis Result
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="prose prose-invert max-w-none">
                                <p className="text-indigo-100/90 leading-relaxed whitespace-pre-wrap text-lg">
                                    {data.response}
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {data.reflection && (
                        <Card className="border-indigo-500/20 bg-indigo-500/5 relative overflow-hidden h-fit">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <SparklesIcon className="w-24 h-24 text-indigo-400 rotate-12" />
                            </div>
                            <CardHeader>
                                <CardTitle className="text-md flex items-center gap-2">
                                    <AlertTriangleIcon className="w-4 h-4 text-amber-400" />
                                    Critic Reflection
                                </CardTitle>
                                <CardDescription>Agentic self-evaluation</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-indigo-200/60 font-medium">Status</span>
                                    <Badge
                                        variant={data.reflection.status === "Logical" ? "success" : "warning"}
                                        className="font-bold"
                                    >
                                        {data.reflection.status}
                                    </Badge>
                                </div>
                                <div className="p-3 bg-black/40 border border-white/5 rounded-xl text-sm italic text-indigo-200/80 leading-relaxed shadow-inner">
                                    &ldquo;{data.reflection.criticism}&rdquo;
                                </div>
                                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                    <span className="text-xs text-indigo-200/40 uppercase tracking-wider font-bold">Confidence Mod</span>
                                    <span className={cn(
                                        "text-sm font-mono",
                                        data.reflection.modifier >= 0 ? "text-emerald-400" : "text-amber-400"
                                    )}>
                                        {data.reflection.modifier >= 0 ? "+" : ""}{data.reflection.modifier}%
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {data.trace && (
                        <Card className="md:col-span-3 border-white/5 bg-black/40">
                            <CardHeader>
                                <CardTitle className="text-sm font-semibold uppercase tracking-widest text-indigo-400">Execution Trace (Explainability)</CardTitle>
                                <CardDescription>Step-by-step diagnostic audit trail</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {data.trace.map((step, i) => (
                                    <div key={i} className="flex items-start gap-4 animate-in slide-in-from-left-2 duration-300" style={{ animationDelay: `${i * 100}ms` }}>
                                        <div className="flex flex-col items-center">
                                            <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)] mt-1.5" />
                                            {i < data.trace!.length - 1 && <div className="w-0.5 h-full min-h-[20px] bg-indigo-500/20 my-1" />}
                                        </div>
                                        <div className="text-sm text-indigo-100/60 font-mono">
                                            <span className="text-indigo-400/40 mr-2">[{i + 1}]</span>
                                            {step}
                                        </div>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            {!data && !loading && !errorMsg && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                        "What services have the highest error rates?",
                        "Show me latency trends for the checkout service",
                        "Which hosts are consuming the most memory?"
                    ].map((example, i) => (
                        <Card
                            key={i}
                            className="bg-white/5 border-white/5 hover:bg-white/10 hover:border-indigo-500/30 transition-all cursor-pointer group"
                            onClick={() => setQuery(example)}
                        >
                            <CardContent className="p-6 flex flex-col justify-between h-full">
                                <p className="text-indigo-200/70 group-hover:text-white transition-colors">&quot;{example}&quot;</p>
                                <div className="mt-4 flex items-center text-xs text-indigo-400 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                                    Try this query <SendIcon className="w-3 h-3 ml-1" />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
