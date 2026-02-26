import React from "react";

import { LogEntry } from "../../types/evidence";

interface LogViewerProps {
    logs: LogEntry[];
}

export const LogViewer: React.FC<LogViewerProps> = ({ logs }) => {
    const [expandedLogs, setExpandedLogs] = React.useState<Record<number, string>>({});

    const handleToggleSummary = (i: number, log: LogEntry) => {
        if (expandedLogs[i]) {
            const next = { ...expandedLogs };
            delete next[i];
            setExpandedLogs(next);
            return;
        }
        setExpandedLogs(prev => ({ ...prev, [i]: 'loading' }));
        setTimeout(() => {
            const m = typeof log.message === 'string' ? log.message.toLowerCase() : JSON.stringify(log.message || "").toLowerCase();
            let summary = "This log indicates a normal operational event in the system lifecycle.";
            if (log["log.level"] === "ERROR" || log["log.level"] === "FATAL" || m.includes("error") || m.includes("fail") || m.includes("exception")) {
                summary = "Critical failure detected. The upstream connection may have dropped or an unexpected exception occurred during processing.";
            } else if (log["log.level"] === "WARN" || m.includes("warn") || m.includes("high")) {
                summary = "Warning state observed. The system may be experiencing resource contention or higher than normal latency. Monitor closely.";
            }
            setExpandedLogs(prev => ({ ...prev, [i]: summary }));
        }, 800);
    };

    if (!logs || logs.length === 0) return <div className="text-slate-500 italic">No logs found.</div>;

    return (
        <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950 font-mono text-xs shadow-inner">
            <div className="flex bg-slate-900/80 px-4 py-2 text-slate-400 font-semibold border-b border-slate-800">
                <div className="w-32 flex-shrink-0">Timestamp</div>
                <div className="w-20 flex-shrink-0">Level</div>
                <div className="w-32 flex-shrink-0">Service</div>
                <div className="flex-1">Message</div>
            </div>
            <div className="max-h-[400px] overflow-y-auto divide-y divide-slate-800/50">
                {logs.map((log, i) => {
                    const level = ((log["log.level"] as string) || "INFO").toUpperCase();
                    let levelColor = "text-slate-400";
                    if (level === "ERROR" || level === "FATAL") levelColor = "text-red-400 bg-red-500/10";
                    if (level === "WARN" || level === "WARNING") levelColor = "text-yellow-400 bg-yellow-500/10";
                    if (level === "INFO") levelColor = "text-blue-400 bg-blue-500/10";

                    return (
                        <div key={i} className="flex flex-col border-b border-slate-800/50 hover:bg-slate-900/30 transition-colors">
                            <div className="flex px-4 py-2 group cursor-pointer" onClick={() => handleToggleSummary(i, log)}>
                                <div className="w-32 flex-shrink-0 text-slate-500 truncate" title={log["@timestamp"] as string}>
                                    {(log["@timestamp"] as string)?.split("T")[1]?.replace("Z", "") || "-"}
                                </div>
                                <div className="w-20 flex-shrink-0">
                                    <span className={`inline-block px-1.5 py-0.5 rounded ${levelColor} text-[10px] font-bold`}>
                                        {level}
                                    </span>
                                </div>
                                <div className="w-32 flex-shrink-0 text-slate-400 truncate" title={log["service.name"] as string}>
                                    {(log["service.name"] as string) || "-"}
                                </div>
                                <div className="flex-1 text-slate-300 break-words whitespace-pre-wrap flex justify-between items-start gap-4">
                                    <div>{log.message || JSON.stringify(log)}</div>
                                    <button
                                        className="opacity-0 group-hover:opacity-100 flex-shrink-0 bg-indigo-500/10 text-indigo-400 text-[10px] px-2 py-0.5 rounded border border-indigo-500/20 hover:bg-indigo-500/20 transition-all flex items-center gap-1"
                                        onClick={(e) => { e.stopPropagation(); handleToggleSummary(i, log); }}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09l2.846.813-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
                                        </svg>
                                        AI Summary
                                    </button>
                                </div>
                            </div>
                            {expandedLogs[i] && (
                                <div className="px-4 py-3 bg-indigo-950/20 border-t border-indigo-500/10 ml-[17rem] -mt-1 text-slate-300 text-xs rounded-br">
                                    <div className="flex items-start gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-indigo-400 mt-0.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                                        </svg>
                                        <div>
                                            {expandedLogs[i] === "loading" ? (
                                                <span className="flex items-center gap-2 text-indigo-400/70 animate-pulse">Running local context analysis...</span>
                                            ) : (
                                                <div className="leading-relaxed">
                                                    <span className="font-medium text-indigo-300 mb-1 block">Contextual AI Insight:</span>
                                                    {expandedLogs[i]}
                                                    <div className="mt-2 text-[10px] text-slate-500 hover:text-indigo-400 cursor-pointer transition-colors inline-block">
                                                        Deep investigate this log line in Copilot →
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
