
import React from "react";
import { useCopilotStore } from "../../store/copilotStore";
import { ConfidenceGauge } from "../../components/ConfidenceGauge";
import { LoadingSkeleton } from "../../components/LoadingSkeleton";
import { ExternalLinkIcon } from "../../components/Icons";
import { useCaseManagement } from "../../hooks/useCaseManagement";
import { LogViewer } from "../evidence/LogViewer";
import { TraceWaterfall } from "../evidence/TraceWaterfall";
import { MetricChart } from "../evidence/MetricChart";
import { LogEntry, TraceSpan, MetricPoint } from "../../types/evidence";

export const ResultsView: React.FC = () => {
    const { result, loading, resultTab, setResultTab, activeStep, statusMessage } = useCopilotStore();

    const steps = ["Analyzing Request", "Gathering Signals", "Correlating Events", "Identifying Root Cause", "Generating Fix"];
    if (loading) return <LoadingSkeleton steps={steps} activeStep={activeStep} statusMessage={statusMessage} />;
    if (!result) return null;

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl mb-8">
                {/* Header */}
                <div className="border-b border-slate-800 p-6 flex flex-col md:flex-row md:items-start justify-between gap-6 bg-slate-900/50">
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                            <div className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${result.confidence >= 0.7 ? "bg-green-500/10 text-green-400 border-green-500/20" :
                                result.confidence >= 0.4 ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" :
                                    "bg-red-500/10 text-red-400 border-red-500/20"
                                }`}>
                                {result.confidence_tier?.toUpperCase() || "CONFIDENCE"}
                            </div>
                            <span className="text-slate-500 text-sm font-mono">Run {result.run_id.slice(0, 8)}</span>
                        </div>
                        <h2 className="text-2xl font-semibold text-white mb-2 leading-tight">
                            {result.root_cause_candidates?.[0] || "Analysis Complete"}
                        </h2>
                        <div className="flex flex-wrap gap-2">
                            {result.executive_summary?.slice(0, 2).map((sum, i) => (
                                <p key={i} className="text-slate-400 text-sm max-w-3xl">{sum.text}</p>
                            ))}
                        </div>
                    </div>
                    <div className="flex-shrink-0">
                        <ConfidenceGauge confidence={result.confidence} size="lg" />
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10 px-2 overflow-x-auto no-scrollbar">
                    {["summary", "evidence", "timeline", "actions"].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setResultTab(tab as "summary" | "evidence" | "timeline" | "actions")}
                            className={`px-6 py-4 text-sm font-medium transition-colors border-b-2 whitespace-nowrap capitalize ${resultTab === tab ? "border-indigo-500 text-white" : "border-transparent text-slate-400 hover:text-slate-200"
                                }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* Tab Content would go here - omitted for brevity in this initial extraction, logic from page.tsx should be moved here */}
                <div className="p-6 min-h-[400px]">
                    {resultTab === "summary" && (
                        <div className="space-y-8">
                            <section>
                                <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Key Findings</h3>
                                <div className="grid gap-4">
                                    {result.findings?.slice(0, 5).map((f, i) => (
                                        <div key={i} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 hover:border-slate-600 transition-colors">
                                            <p className="text-slate-200 text-sm leading-relaxed">{f.message || JSON.stringify(f)}</p>
                                            {f.links && f.links.length > 0 && (
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    {f.links.map((l, j) => (
                                                        <a key={j} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 px-2 py-1 rounded transition-colors">
                                                            <ExternalLinkIcon className="w-3 h-3" /> {l.label}
                                                        </a>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </section>
                        </div>
                    )}

                    {resultTab === "evidence" && (
                        <div className="space-y-6">
                            {(!result.evidence_by_type || Object.keys(result.evidence_by_type).length === 0) && (
                                <p className="text-slate-500 italic p-4 text-center">No structured evidence available.</p>
                            )}

                            {result.evidence_by_type?.logs && (result.evidence_by_type.logs as LogEntry[]).length > 0 && (
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-blue-400"></span> Logs
                                    </h3>
                                    <LogViewer logs={result.evidence_by_type.logs as LogEntry[]} />
                                </div>
                            )}

                            {result.evidence_by_type?.traces && (result.evidence_by_type.traces as TraceSpan[]).length > 0 && (
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-indigo-400"></span> Traces
                                    </h3>
                                    <TraceWaterfall traces={result.evidence_by_type.traces as TraceSpan[]} />
                                </div>
                            )}

                            {result.evidence_by_type?.metrics && (result.evidence_by_type.metrics as MetricPoint[]).length > 0 && (
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-purple-400"></span> Metrics
                                    </h3>
                                    <MetricChart metrics={result.evidence_by_type.metrics as MetricPoint[]} />
                                </div>
                            )}

                            {/* Fallback for other types */}
                            {Object.entries(result.evidence_by_type || {}).map(([type, items]) => {
                                if (["logs", "traces", "metrics"].includes(type)) return null;
                                return (
                                    <div key={type} className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/30">
                                        <h4 className="text-indigo-400 font-medium capitalize mb-2">{type}</h4>
                                        <pre className="text-xs text-slate-400 overflow-x-auto bg-slate-900/50 p-2 rounded">
                                            {JSON.stringify(items, null, 2)}
                                        </pre>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {resultTab === "timeline" && (
                        <div className="space-y-6">
                            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Event Timeline</h3>
                            <div className="relative border-l-2 border-slate-800 ml-3 pl-8 space-y-8">
                                {result.findings?.map((f, i) => {
                                    // Calculate simplified relative time or just show timestamp nicely
                                    const timeDisplay = f["@timestamp"] ? f["@timestamp"].split("T")[1]?.replace("Z", "") : "00:00:00";

                                    return (
                                        <div key={i} className="relative group">
                                            {/* Timeline Node */}
                                            <div className="absolute -left-[41px] top-1 w-6 h-6 rounded-full bg-slate-900 border-2 border-indigo-500 group-hover:border-indigo-400 group-hover:scale-110 transition-all flex items-center justify-center">
                                                <div className="w-2 h-2 rounded-full bg-indigo-500 group-hover:bg-indigo-400" />
                                            </div>

                                            {/* Card */}
                                            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 hover:border-slate-600 transition-all hover:bg-slate-800/80 hover:shadow-lg hover:shadow-indigo-500/10">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <span className="text-xs font-mono text-slate-500 bg-slate-900/50 px-2 py-0.5 rounded border border-slate-700/50">
                                                        {timeDisplay}
                                                    </span>
                                                    {i === 0 && <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">START</span>}
                                                    {i === (result.findings?.length || 0) - 1 && <span className="text-[10px] font-bold text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">LATEST</span>}
                                                </div>
                                                <p className="text-slate-200 text-sm leading-relaxed">{f.message}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {resultTab === "actions" && (
                        <div className="space-y-6">
                            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Proposed Remediation</h3>
                            <div className="grid gap-4">
                                {result.proposed_fixes?.map((fix, i) => {
                                    const isHighRisk = (fix.risk_level || "").toLowerCase() === "high";
                                    return (
                                        <div key={i} className="bg-slate-800/40 rounded-xl p-5 border border-slate-700/50 flex flex-col sm:flex-row gap-4 sm:items-center justify-between group hover:border-slate-600 transition-all">
                                            <div className="flex items-start gap-4">
                                                <div className="mt-1 w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-sm font-bold text-indigo-400 group-hover:bg-indigo-500/20 transition-colors">
                                                    {i + 1}
                                                </div>
                                                <div>
                                                    <p className="text-slate-200 font-medium mb-1">{fix.action}</p>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${isHighRisk ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-green-500/10 text-green-400 border-green-500/20"}`}>
                                                            {fix.risk_level || "Low Risk"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <button className="text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100">
                                                View Details
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="pt-6 border-t border-slate-800">
                                <CaseCreationSection />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// Subcomponent for Action tab to keep main component cleaner
const CaseCreationSection: React.FC = () => {
    const { createCase } = useCaseManagement();
    const { createCaseLoading, createCaseError, createdCaseUrl } = useCopilotStore();

    if (createdCaseUrl) {
        return (
            <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-xl flex items-center justify-between">
                <div>
                    <h4 className="text-green-400 font-medium mb-1">Case Created Successfully</h4>
                    <p className="text-xs text-green-500/70">The incident has been logged in Kibana.</p>
                </div>
                <a
                    href={createdCaseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-600 transition-colors"
                >
                    View Case
                </a>
            </div>
        );
    }

    return (
        <div>
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Operations</h3>
            <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-700/30 flex items-center justify-between">
                <div>
                    <h4 className="text-slate-200 font-medium mb-1">Create Kibana Case</h4>
                    <p className="text-xs text-slate-500">Log this analysis as a new case in your observability workflow.</p>
                </div>
                <button
                    onClick={createCase}
                    disabled={createCaseLoading}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${createCaseLoading
                        ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                        : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                        }`}
                >
                    {createCaseLoading ? "Creating..." : "Create Case"}
                </button>
            </div>
            {createCaseError && (
                <p className="mt-3 text-red-400 text-sm bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                    Error: {createCaseError}
                </p>
            )}
        </div>
    );
};
