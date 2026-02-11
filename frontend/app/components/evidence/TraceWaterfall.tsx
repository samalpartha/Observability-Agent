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
                    <div className="flex-shrink-0 w-16 text-right text-xs font-mono text-slate-500">
                        {node.duration.toFixed(0)}ms
                    </div>
                </div>

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
                <div className="w-16 text-right">Dur</div>
            </div>
            <div className="p-2 space-y-0.5 overflow-x-auto">
                {rootNodes.map(renderNode)}
            </div>
        </div>
    );
};
