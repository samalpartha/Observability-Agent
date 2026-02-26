import { useCopilotStore } from "../../store/copilotStore";
import { useDashboard } from "../../hooks/useDashboard";
import { useAnalysis } from "../../hooks/useAnalysis";
import {
    AlertCircleIcon,
    ActivityIcon,
    ServerIcon,
    CheckCircleIcon,
    SearchIcon,
    SparklesIcon,
} from "../Icons";
import { LogAnomalies } from "../analytics/LogAnomalies";
import { PredictiveForecast } from "../analytics/PredictiveForecast";


interface Investigation {
    id: string;
    service: string;
    title: string;
    progress: number;
    description: string;
    trigger: string;
    impact: string;
}

interface ServiceHealth {
    name: string;
    status: string;
    percentage: number;
    instance_health: string[];
    instances: number;
}

interface Finding {
    id: string;
    ago: string;
    tags: string[];
    title: string;
    description: string;
    investigate_link?: string;
}

export function DashboardView() {
    const { loading } = useDashboard();
    const { runAnalysis } = useAnalysis();
    const apiInvestigations = useCopilotStore(state => state.apiInvestigations);
    const serviceHealth = useCopilotStore(state => state.serviceHealth);
    const recentFindings = useCopilotStore(state => state.recentFindings);
    const { setQuestion, setService } = useCopilotStore();

    const handleInvestigate = (inv: Investigation) => {
        // Pre-populate the question from the investigation title/description
        const query = `Why is there a ${inv.title.toLowerCase()}?`;
        setQuestion(query);
        setService(inv.service || "");
        runAnalysis({ question: query, service: inv.service, time_range: ["now-1h", "now"] });
        // Scroll to top so the results view is visible
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const handleAnalyzeFinding = (finding: Finding) => {
        // Build a smart query from the finding
        const query = finding.investigate_link
            ? finding.title
            : `Investigate: ${finding.title}`;
        setQuestion(query);
        runAnalysis({ question: query, time_range: ["now-1h", "now"] });
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const handleServiceClick = (svc: ServiceHealth) => {
        if (svc.status === "OPTIMAL") return;
        const query = `Why is the ${svc.name} service showing ${svc.percentage}% ${svc.status.toLowerCase()}?`;
        setQuestion(query);
        setService(svc.name);
        runAnalysis({ question: query, service: svc.name, time_range: ["now-1h", "now"] });
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    if (loading && apiInvestigations.length === 0) {
        return (
            <div className="w-full max-w-7xl mx-auto p-6 animate-pulse">
                <div className="h-8 bg-slate-800/50 rounded w-1/4 mb-6"></div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="h-64 bg-slate-800/50 rounded-lg"></div>
                    <div className="h-64 bg-slate-800/50 rounded-lg"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-7xl mx-auto p-4 space-y-6 animate-in fade-in duration-500">

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                {/* Left Column: Active Investigations & Service Health */}
                <div className="xl:col-span-2 space-y-6">

                    {/* Active Investigations */}
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                                <AlertCircleIcon className="w-5 h-5 text-red-400" />
                                Active Investigations
                            </h2>
                            <span className="bg-red-500/10 text-red-400 px-2 py-1 rounded text-xs font-medium border border-red-500/20">
                                {apiInvestigations.length} Critical
                            </span>
                        </div>

                        <div className="space-y-4">
                            {apiInvestigations.length === 0 ? (
                                <div className="p-8 text-center border border-slate-800 rounded-xl bg-slate-900/50 text-slate-400">
                                    <CheckCircleIcon className="w-8 h-8 text-green-500 mx-auto mb-2" />
                                    <p>No active investigations. Systems are healthy.</p>
                                </div>
                            ) : (
                                apiInvestigations.map((inv: Investigation) => (
                                    <div key={inv.id} className="group relative overflow-hidden rounded-xl bg-slate-900/80 border border-slate-800 hover:border-indigo-500/50 transition-all duration-300">
                                        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-red-500 to-orange-500"></div>
                                        <div className="p-5 pl-6">
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-xs font-bold text-red-400 tracking-wider">CRITICAL</span>
                                                        <span className="text-slate-600">•</span>
                                                        <span className="text-xs text-slate-400">{inv.service}</span>
                                                    </div>
                                                    <h3 className="text-lg font-medium text-white group-hover:text-indigo-300 transition-colors">
                                                        {inv.title}
                                                    </h3>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-2xl font-bold text-white">{inv.progress}%</div>
                                                    <div className="text-xs text-slate-500">Analysis Progress</div>
                                                </div>
                                            </div>

                                            <p className="text-sm text-slate-400 mb-4 line-clamp-2">
                                                {inv.description}
                                            </p>

                                            <div className="relative h-1.5 w-full bg-slate-800 rounded-full overflow-hidden mb-4">
                                                <div
                                                    className="absolute top-0 left-0 h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-1000 ease-out"
                                                    style={{ width: `${inv.progress}%` }}
                                                ></div>
                                            </div>

                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4 text-xs text-slate-500 font-mono">
                                                    <span>TRIGGER: {inv.trigger}</span>
                                                    <span>IMPACT: {inv.impact}</span>
                                                </div>
                                                <button
                                                    onClick={() => handleInvestigate(inv)}
                                                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-sm font-medium rounded-lg transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2"
                                                >
                                                    <SparklesIcon className="w-3.5 h-3.5" />
                                                    Investigate with AI
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>

                    {/* Service Health */}
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                                <ActivityIcon className="w-5 h-5 text-emerald-400" />
                                Service Health Overview
                            </h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {serviceHealth.map((svc: ServiceHealth) => {
                                const isDegraded = svc.status !== "OPTIMAL";
                                return (
                                    <div
                                        key={svc.name}
                                        onClick={() => handleServiceClick(svc)}
                                        className={`p-4 rounded-xl bg-slate-900/50 border border-slate-800 transition-all ${isDegraded ? "hover:bg-slate-800/50 hover:border-amber-500/30 cursor-pointer" : "cursor-default"}`}
                                        title={isDegraded ? `Click to investigate ${svc.name}` : undefined}
                                    >
                                        <div className="flex justify-between items-center mb-3">
                                            <div className="flex items-center gap-2">
                                                <ServerIcon className="w-4 h-4 text-slate-400" />
                                                <span className="font-medium text-slate-200">{svc.name}</span>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${svc.status === 'OPTIMAL' ? 'bg-emerald-500/10 text-emerald-400' :
                                                svc.status === 'STABLE' ? 'bg-blue-500/10 text-blue-400' : 'bg-yellow-500/10 text-yellow-400'
                                                }`}>
                                                {svc.percentage}% {svc.status}
                                            </span>
                                        </div>

                                        <div className="flex gap-1">
                                            {svc.instance_health.map((status: string, i: number) => (
                                                <div
                                                    key={i}
                                                    className={`h-8 flex-1 rounded-sm transition-all hover:scale-105 ${status === 'healthy' ? 'bg-emerald-500/20 hover:bg-emerald-500/40' :
                                                        status === 'degraded' ? 'bg-yellow-500/20 hover:bg-yellow-500/40' :
                                                            'bg-red-500/20 hover:bg-red-500/40'
                                                        }`}
                                                    title={`Instance ${i + 1}: ${status}`}
                                                ></div>
                                            ))}
                                        </div>
                                        <div className="mt-2 text-xs text-right text-slate-500">
                                            {svc.instances} instances
                                            {isDegraded && <span className="ml-2 text-amber-400">→ Click to investigate</span>}
                                        </div>

                                        {/* AIOps Predictive Forecast */}
                                        <PredictiveForecast service={svc.name} />
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {/* AIOps Log Anomalies */}
                    <div className="mt-8">
                        <LogAnomalies />
                    </div>

                </div>

                {/* Right Column: Recent Findings */}
                <div className="space-y-6">
                    <section className="h-full">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                                <SearchIcon className="w-5 h-5 text-purple-400" />
                                Recent Findings
                            </h2>
                        </div>

                        <div className="bg-slate-900/30 border border-slate-800/50 rounded-xl p-1 min-h-[500px]">
                            {recentFindings.map((finding: Finding) => (
                                <div key={finding.id} className="p-4 border-b border-slate-800/50 last:border-0 hover:bg-slate-800/30 transition-colors group">
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{finding.ago}</span>
                                        <div className="flex gap-1">
                                            {finding.tags?.map((tag: string) => (
                                                <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded border border-slate-700">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <h4 className="text-sm font-medium text-slate-200 group-hover:text-indigo-400 transition-colors mb-1">
                                        {finding.title}
                                    </h4>
                                    <p className="text-xs text-slate-400 leading-relaxed">
                                        {finding.description}
                                    </p>
                                    {finding.investigate_link && (
                                        <button
                                            onClick={() => handleAnalyzeFinding(finding)}
                                            className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 active:scale-95 flex items-center gap-1 font-medium transition-all"
                                        >
                                            ANALYZE FINDING →
                                        </button>
                                    )}
                                </div>
                            ))}

                            {recentFindings.length === 0 && (
                                <div className="p-8 text-center text-slate-500 text-sm">
                                    No recent findings.
                                </div>
                            )}
                        </div>
                    </section>
                </div>

            </div>
        </div>
    );
}
