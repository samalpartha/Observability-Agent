import { useEffect, useState } from 'react';
import { useObservabilityApi } from '../../hooks/useObservabilityApi';
import { ActivityIcon } from '../Icons';

interface ForecastPoint {
    timestamp: string;
    actual?: number;
    predicted?: number;
    upper?: number;
    lower?: number;
}

interface ForecastResponse {
    metric: string;
    unit: string;
    data: ForecastPoint[];
    is_anomalous: boolean;
    warning?: string;
}

export function PredictiveForecast({ service }: { service: string }) {
    const { fetchWithAuth } = useObservabilityApi();
    const [data, setData] = useState<ForecastResponse | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        const fetchForecast = async () => {
            try {
                const res = await fetchWithAuth(`/api/aiops/forecast?service=${service}&metric=jvm.memory.heap.used.bytes`);
                if (!res) throw new Error('Failed to authenticate request');
                if (!res.ok) throw new Error('Failed to fetch');
                const result = await res.json();
                if (isMounted) setData(result);
            } catch (err) {
                console.error(err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        fetchForecast();
        return () => { isMounted = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [service]);

    if (loading || !data || data.data.length === 0) {
        return <div className="h-10 mt-3 animate-pulse bg-slate-800/50 rounded flex items-center justify-center text-[10px] text-slate-500">Analyzing trends...</div>;
    }

    const { data: points, is_anomalous, warning } = data;

    // Normalize data for a mini sparkline
    const allVals = points.map(p => p.actual ?? p.predicted ?? 0);
    const minVal = Math.min(...allVals);
    const maxVal = Math.max(...allVals, minVal + 1);
    const range = maxVal - minVal;

    const svgWidth = 200;
    const svgHeight = 40;

    const getPointStr = (pts: ForecastPoint[], key: 'actual' | 'predicted') => {
        return pts.map((p, i) => {
            const val = p[key];
            if (val === undefined) return null;
            const x = (i / (points.length - 1)) * svgWidth;
            const y = svgHeight - ((val - minVal) / range) * svgHeight;
            return `${x},${y}`;
        }).filter(Boolean).join(' ');
    };

    const actualStr = getPointStr(points, 'actual');
    const predictedStr = getPointStr(points, 'predicted');

    // Find the split point between actual and predicted
    const splitIndex = points.findIndex(p => p.predicted !== undefined);
    const splitX = splitIndex > 0 ? (splitIndex / (points.length - 1)) * svgWidth : 0;

    return (
        <div className="mt-3 bg-slate-900/40 rounded p-2 border border-slate-800/50">
            <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-mono text-slate-400 capitalize flex items-center gap-1">
                    <ActivityIcon className="w-3 h-3 text-emerald-400" />
                    Trend Forecast
                </span>
                {is_anomalous && (
                    <span className="text-[9px] bg-amber-500/20 text-amber-500 border border-amber-500/30 px-1 py-0.5 rounded">
                        Leak Detected
                    </span>
                )}
            </div>

            <div className="relative h-10 w-full overflow-hidden">
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
                    {/* Actual data line */}
                    {actualStr && (
                        <polyline
                            points={actualStr}
                            fill="none"
                            stroke={is_anomalous ? "#f59e0b" : "#6366f1"}
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    )}

                    {/* Forecasted data line (dashed) */}
                    {predictedStr && (
                        <polyline
                            points={predictedStr}
                            fill="none"
                            stroke="#818cf8"
                            strokeWidth="2"
                            strokeDasharray="4,4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    )}

                    {/* Delineator line for 'Now' */}
                    {splitX > 0 && (
                        <line x1={splitX} y1="0" x2={splitX} y2={svgHeight} stroke="#475569" strokeWidth="1" strokeDasharray="2,2" />
                    )}
                </svg>
            </div>
            {is_anomalous && warning && (
                <div className="text-[9px] text-amber-400/80 mt-1 leading-tight text-right">
                    {warning}
                </div>
            )}
        </div>
    );
}
