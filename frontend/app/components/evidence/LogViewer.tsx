import React from "react";

import { LogEntry } from "../../types/evidence";

interface LogViewerProps {
    logs: LogEntry[];
}

export const LogViewer: React.FC<LogViewerProps> = ({ logs }) => {
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
                        <div key={i} className="flex px-4 py-2 hover:bg-slate-900/30 transition-colors">
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
                            <div className="flex-1 text-slate-300 break-words whitespace-pre-wrap">
                                {log.message || JSON.stringify(log)}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
