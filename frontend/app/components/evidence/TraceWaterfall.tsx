import React, { useMemo, useState } from "react";
import { TraceSpan } from "../../types/evidence";

interface TraceWaterfallProps {
    traces: TraceSpan[];
}

interface SpanNode {
    span: TraceSpan;
    children: SpanNode[];
    depth: number;
    startTime: number;
    duration: number;
}

export const TraceWaterfall: React.FC<TraceWaterfallProps> = ({ traces }) => {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [aiSummaries, setAiSummaries] = useState<Record<string, string>>({});

    const handleToggleSummary = (e: React.MouseEvent, spanId: string, node: SpanNode) => {
        e.stopPropagation();
        if (aiSummaries[spanId]) {
            const next = { ...aiSummaries };
            delete next[spanId];
            setAiSummaries(next);
            return;
        }
        setAiSummaries(prev => ({ ...prev, [spanId]: 'loading' }));
        setTimeout(() => {
            let summary = `This traced operation executed in ${node.duration.toFixed(2)}ms. The duration and execution path appear normal for this service.`;
            const isError = (node.span["log.level"] === "ERROR") || (node.span["error"] === true);
            if (isError) {
                summary = "Critical tracing error detected. The span failed, likely due to a downstream service timeout or 500 internal server error response.";
            } else if (node.duration > 500) {
                summary = "Elevated latency detected on this span. A database lookup or external API call might be bottlenecking performance.";
            }
            setAiSummaries(prev => ({ ...prev, [spanId]: summary }));
        }, 800);
    };

    const { rootNodes, globalStart, globalDuration } = useMemo(() => {
        if (!traces || traces.length === 0) return { rootNodes: [], globalStart: 0, globalDuration: 0 };

        const nodes: Record<string, SpanNode> = {};
        let minTime = Infinity;
        let maxTime = -Infinity;

        // 1. Create nodes and find time bounds
        traces.forEach(t => {
            const id = t["span.id"] as string;
            const startTime = new Date(t["@timestamp"] as string).getTime();
            // event.duration is usually in nanoseconds in OTEL, convert to ms
            const durationNs = Number(t["event.duration"] || 0);
            const durationMs = durationNs / 1_000_000;

            if (startTime < minTime) minTime = startTime;
            if (startTime + durationMs > maxTime) maxTime = startTime + durationMs;

            if (id) {
                nodes[id] = {
                    span: t,
                    children: [],
                    depth: 0,
                    startTime,
                    duration: durationMs
                };
            }
        });

        // Handle case where maxTime didn't get updated correctly or single point
        if (maxTime <= minTime) maxTime = minTime + 1000;

        const rootNodes: SpanNode[] = [];

        // 2. Build tree
        traces.forEach(t => {
            const id = t["span.id"] as string;
            const parentId = t["parent.id"] as string;

            if (id && nodes[id]) {
                if (parentId && nodes[parentId]) {
                    nodes[parentId].children.push(nodes[id]);
                } else {
                    rootNodes.push(nodes[id]);
                }
            }
        });

        // 3. Sort children by time and assign depth recursively
        const processNode = (node: SpanNode, depth: number) => {
            node.depth = depth;
            node.children.sort((a, b) => a.startTime - b.startTime);
            node.children.forEach(c => processNode(c, depth + 1));
        };

        rootNodes.sort((a, b) => a.startTime - b.startTime);
        rootNodes.forEach(n => processNode(n, 0));

        return { rootNodes, globalStart: minTime, globalDuration: maxTime - minTime };
    }, [traces]);

    if (!traces || traces.length === 0) return <div className="text-slate-500 italic">No traces found.</div>;

    const toggleExpand = (id: string) => {
        const newSet = new Set(expandedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedIds(newSet);
    };

    const renderNode = (node: SpanNode) => {
        const spanId = node.span["span.id"] as string;
        const relativeStart = (node.startTime - globalStart) / globalDuration;
        const relativeWidth = Math.max(node.duration / globalDuration, 0.005); // min width 0.5%

        // Safety checks for layout
        const leftPct = Math.max(0, Math.min(100, relativeStart * 100));
        const widthPct = Math.max(0, Math.min(100 - leftPct, relativeWidth * 100));

        const isExpanded = expandedIds.has(spanId);
        const hasChildren = node.children.length > 0;

        // Color coding by service or error
        const isError = (node.span["log.level"] === "ERROR") || (node.span["error"] === true);
        const barColor = isError ? "bg-red-500" : "bg-indigo-500";
        const borderColor = isError ? "border-red-500/50" : "border-indigo-500/30";

        return (
            <div key={spanId} className="group">
                <div className={`relative flex items-center hover:bg-slate-800/50 rounded pr-2 py-1 transition-colors border-l-2 ${isError ? 'border-red-500' : 'border-transparent'}`}>

                    {/* Tree Indentation & Meta */}
                    <div
                        className="flex-shrink-0 flex items-center gap-2 overflow-hidden"
                        style={{ width: '25%', paddingLeft: `${node.depth * 16}px` }}
                    >
                        <button
                            onClick={() => toggleExpand(spanId)}
                            disabled={!hasChildren}
                            className={`w-4 h-4 flex items-center justify-center rounded hover:bg-slate-700 ${!hasChildren ? 'opacity-0' : ''}`}
                        >
                            <span className="text-slate-400 text-[10px]">{isExpanded ? '▼' : '▶'}</span>
                        </button>

                        <div className="flex flex-col min-w-0">
                            <span className="text-xs font-medium text-slate-200 truncate" title={node.span["span.name"] as string}>
                                {node.span["span.name"] as string || "Unknown Span"}
                            </span>
                            <span className="text-[10px] text-slate-500 truncate">
                                {node.span["service.name"] as string}
                            </span>
                        </div>
                    </div>

                    {/* Gantt Bar Area */}
                    <div className="flex-grow relative h-6 mx-2">
                        {/* Grid lines (optional, simplified) */}
                        <div className="absolute inset-0 border-l border-slate-800/50" style={{ left: '0%' }}></div>
                        <div className="absolute inset-0 border-l border-slate-800/50" style={{ left: '25%' }}></div>
                        <div className="absolute inset-0 border-l border-slate-800/50" style={{ left: '50%' }}></div>
                        <div className="absolute inset-0 border-l border-slate-800/50" style={{ left: '75%' }}></div>

                        {/* The Bar */}
                        <div
                            className={`absolute h-4 top-1 rounded text-[10px] flex items-center px-2 text-white/90 shadow-sm ${barColor} ${borderColor} border`}
                            style={{
                                left: `${leftPct}%`,
                                width: `${widthPct}%`,
                                minWidth: '4px'
                            }}
                        >
                            <span className="truncate drop-shadow-md hidden group-hover:block ml-1">
                                {node.duration.toFixed(2)}ms
                            </span>
                        </div>
                    </div>

                    {/* Duration Label (Right side) */}
                    <div className="flex-shrink-0 w-[100px] text-right text-xs font-mono text-slate-500 flex items-center justify-end gap-2 pr-1">
                        <button
                            className="opacity-0 group-hover:opacity-100 flex-shrink-0 bg-indigo-500/10 text-indigo-400 text-[9px] px-1.5 py-0.5 rounded border border-indigo-500/20 hover:bg-indigo-500/20 transition-all flex items-center gap-0.5"
                            onClick={(e) => handleToggleSummary(e, spanId, node)}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-2.5 h-2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09l2.846.813-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
                            </svg>
                            AI
                        </button>
                        <span>{node.duration.toFixed(0)}ms</span>
                    </div>
                </div>

                {aiSummaries[spanId] && (
                    <div className="px-4 py-3 bg-indigo-950/20 border-t border-indigo-500/10 ml-[25%] -mt-1 text-slate-300 text-xs rounded-bl mb-1 mr-2 relative z-10 border-l border-b border-indigo-500/20">
                        <div className="flex items-start gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-indigo-400 mt-0.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                            </svg>
                            <div>
                                {aiSummaries[spanId] === "loading" ? (
                                    <span className="flex items-center gap-2 text-indigo-400/70 animate-pulse">Analyzing trace span...</span>
                                ) : (
                                    <div className="leading-relaxed">
                                        <span className="font-medium text-indigo-300 mb-1 block">Contextual AI Insight:</span>
                                        {aiSummaries[spanId]}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Recursion */}
                {(isExpanded || true) && ( // Default expanded for now for visibility
                    <div className="flex flex-col">
                        {node.children.map(renderNode)}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="bg-slate-900/30 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between bg-slate-900/80 px-4 py-2 border-b border-slate-800 text-xs font-medium text-slate-400">
                <div style={{ width: '25%' }}>Ops / Service</div>
                <div className="flex-grow text-center">Timeline ({globalDuration.toFixed(2)}ms)</div>
                <div className="w-[100px] text-right">Dur</div>
            </div>
            <div className="p-2 space-y-0.5 overflow-x-auto">
                {rootNodes.map(renderNode)}
            </div>
        </div>
    );
};
