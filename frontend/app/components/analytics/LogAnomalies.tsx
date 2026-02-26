import { useEffect, useState } from 'react';
import { useCopilotStore } from '../../store/copilotStore';
import { AlertCircleIcon, FilterIcon, RefreshCwIcon, ActivityIcon } from '../Icons';
import { useObservabilityApi } from '../../hooks/useObservabilityApi';

interface LogCategory {
    signature: string;
    count: number;
    sample_message: string;
}

interface AnomaliesResponse {
    categories: LogCategory[];
    anomaly_detected: boolean;
    anomaly_reason?: string;
}

export function LogAnomalies() {
    const { fetchWithAuth } = useObservabilityApi();
    const [data, setData] = useState<AnomaliesResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const serviceHealth = useCopilotStore(state => state.serviceHealth);

    // Pick the most critical service to analyze, or fallback
    const targetService = serviceHealth.find(s => s.status !== 'OPTIMAL')?.name || 'payment-service';

    const fetchAnomalies = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetchWithAuth(`/api/aiops/categories?service=${targetService}`);
            if (!res) throw new Error('Failed to authenticate request');
            if (!res.ok) throw new Error('Failed to fetch anomalies');
            const result = await res.json();
            setData(result);
        } catch (err: unknown) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAnomalies();
        const interval = setInterval(fetchAnomalies, 30000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [targetService]);

    return (
        <section className="h-full">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                    <FilterIcon className="w-5 h-5 text-indigo-400" />
                    AIOps Log Categories
                </h2>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Target: {targetService}</span>
                    <button onClick={fetchAnomalies} className="p-1 hover:bg-slate-800 rounded text-slate-400 transition-colors">
                        <RefreshCwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 min-h-[300px] flex flex-col">
                {error ? (
                    <div className="text-red-400 text-sm p-4 bg-red-500/10 rounded-lg flex items-center gap-2 m-auto">
                        <AlertCircleIcon className="w-4 h-4" />
                        {error}
                    </div>
                ) : loading && !data ? (
                    <div className="m-auto flex flex-col justify-center items-center h-full">
                        <RefreshCwIcon className="w-6 h-6 text-indigo-500 animate-spin mb-3" />
                        <span className="text-sm text-slate-400">Analyzing log patterns...</span>
                    </div>
                ) : data && data.categories.length === 0 ? (
                    <div className="m-auto text-slate-400 text-sm text-center">
                        <p>No recent ERROR/WARN logs found for {targetService}.</p>
                    </div>
                ) : data ? (
                    <div className="space-y-4">
                        {data.anomaly_detected && (
                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex gap-3 text-sm">
                                <ActivityIcon className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                                <div>
                                    <h4 className="font-medium text-amber-400 mb-1">Anomaly Detected</h4>
                                    <p className="text-amber-200/80">{data.anomaly_reason}</p>
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            {data.categories.map((cat, idx) => {
                                const progressPct = Math.min((cat.count / 100) * 100, 100);
                                return (
                                    <div key={idx} className="p-3 bg-slate-800/40 rounded-lg border border-slate-700/50 hover:border-indigo-500/30 transition-colors">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="text-xs font-mono text-indigo-300 break-all pr-4 font-semibold line-clamp-1">
                                                {cat.signature}
                                            </div>
                                            <span className="text-xs font-bold px-2 py-0.5 bg-slate-700 text-white rounded">
                                                {cat.count} hits
                                            </span>
                                        </div>
                                        <div className="text-xs text-slate-400 mb-2 italic line-clamp-2">
                                            &quot;{cat.sample_message}&quot;
                                        </div>
                                        <div className="w-full bg-slate-900 rounded-full h-1.5">
                                            <div
                                                className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500"
                                                style={{ width: `${progressPct}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : null}
            </div>
        </section>
    );
}
