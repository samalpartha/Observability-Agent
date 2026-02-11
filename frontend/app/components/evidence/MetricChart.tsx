import React from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { MetricPoint } from "../../types/evidence";

interface MetricChartProps {
    metrics: MetricPoint[];
}

export const MetricChart: React.FC<MetricChartProps> = ({ metrics }) => {
    if (!metrics || metrics.length === 0) return <div className="text-slate-500 italic">No metrics found.</div>;

    // Group by metric name
    const groupedMetrics: Record<string, MetricPoint[]> = {};
    metrics.forEach(m => {
        const name = (m["metric.name"] as string) || "Unknown Metric";
        if (!groupedMetrics[name]) groupedMetrics[name] = [];
        groupedMetrics[name].push(m);
    });

    return (
        <div className="grid grid-cols-1 gap-6">
            {Object.entries(groupedMetrics).map(([name, points]) => {
                // Prepare data for Recharts
                const data = points
                    .map(p => ({
                        time: new Date(p["@timestamp"] as string).toLocaleTimeString(),
                        fullTime: p["@timestamp"],
                        value: Number(p["metric.value"] || 0),
                    }))
                    .sort((a, b) => new Date(a.fullTime as string).getTime() - new Date(b.fullTime as string).getTime());

                const lastValue = data[data.length - 1]?.value?.toFixed(2);
                const maxValue = Math.max(...data.map(d => d.value)).toFixed(2);
                const avgValue = (data.reduce((acc, curr) => acc + curr.value, 0) / data.length).toFixed(2);

                return (
                    <div key={name} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 shadow-lg">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h4 className="text-indigo-400 text-sm uppercase tracking-wider font-semibold">{name}</h4>
                                <div className="flex gap-4 mt-1 text-xs text-slate-500">
                                    <span>Last: <span className="text-slate-200 font-mono">{lastValue}</span></span>
                                    <span>Max: <span className="text-slate-200 font-mono">{maxValue}</span></span>
                                    <span>Avg: <span className="text-slate-200 font-mono">{avgValue}</span></span>
                                </div>
                            </div>
                        </div>

                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data}>
                                    <defs>
                                        <linearGradient id={`color${name}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                    <XAxis
                                        dataKey="time"
                                        stroke="#475569"
                                        tick={{ fill: '#475569', fontSize: 10 }}
                                        tickLine={false}
                                        axisLine={false}
                                        minTickGap={30}
                                    />
                                    <YAxis
                                        stroke="#475569"
                                        tick={{ fill: '#475569', fontSize: 10 }}
                                        tickLine={false}
                                        axisLine={false}
                                        width={40}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        itemStyle={{ color: '#818cf8', fontSize: '12px', fontWeight: 500 }}
                                        labelStyle={{ color: '#94a3b8', fontSize: '11px', marginBottom: '4px' }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="value"
                                        stroke="#6366f1"
                                        strokeWidth={2}
                                        fillOpacity={1}
                                        fill={`url(#color${name})`}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
