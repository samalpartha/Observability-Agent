"use client";

import React, { useState, useEffect } from "react";
import { SearchIcon, PlayIcon, HistoryIcon, BookOpenIcon, DownloadIcon, CopyIcon, CheckIcon, XCircleIcon } from "../Icons";

interface ESQLQueryPanelProps {
    className?: string;
}

interface QueryExample {
    name: string;
    query: string;
}

interface QueryResult {
    columns: { name: string; type: string }[];
    rows: (string | number | boolean | null)[][];
    took_ms: number;
    total_rows: number;
}

interface QueryHistoryItem {
    query: string;
    timestamp: number;
    success: boolean;
}

interface Toast {
    id: number;
    message: string;
    type: "success" | "error" | "info";
}

export function ESQLQueryPanel({ className = "" }: ESQLQueryPanelProps) {
    const [query, setQuery] = useState("");
    const [result, setResult] = useState<QueryResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | { message: string; line?: number; column?: number; suggestion?: string } | null>(null);
    const [examples, setExamples] = useState<Record<string, QueryExample[]>>({});
    const [showExamples, setShowExamples] = useState(false);
    const [queryHistory, setQueryHistory] = useState<QueryHistoryItem[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [sortColumn, setSortColumn] = useState<number | null>(null);
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

    //  Load query history from localStorage
    useEffect(() => {
        const saved = localStorage.getItem("esql_query_history");
        if (saved) {
            try {
                setQueryHistory(JSON.parse(saved));
            } catch {
                // Ignore errors when loading existing history
            }
        }
    }, []);

    // Fetch examples on mount
    useEffect(() => {
        fetchExamples();
    }, []);

    const showToast = (message: string, type: Toast["type"] = "info") => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    };

    const fetchExamples = async () => {
        try {
            const token = localStorage.getItem("observability_copilot_token");
            const res = await fetch("http://localhost:8765/esql/examples", {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setExamples(data);
            }
        } catch (err) {
            console.error("Failed to load examples:", err);
        }
    };

    const saveToHistory = (q: string, success: boolean) => {
        const newHistory: QueryHistoryItem[] = [
            { query: q, timestamp: Date.now(), success },
            ...queryHistory.filter(h => h.query !== q).slice(0, 19) // Keep last 20
        ];
        setQueryHistory(newHistory);
        localStorage.setItem("esql_query_history", JSON.stringify(newHistory));
    };

    const executeQuery = async () => {
        if (!query.trim()) return;

        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const token = localStorage.getItem("observability_copilot_token");
            const res = await fetch("http://localhost:8765/esql/query", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ query, limit: 1000 })
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || "Query failed");
            }

            const data = await res.json();
            setResult(data);
            saveToHistory(query, true);
            showToast(`Query executed successfully! ${data.total_rows} rows in ${data.took_ms}ms`, "success");
        } catch (err) {
            const errorMsg = (err instanceof Error) ? err.message : "Query execution failed";

            // Add helpful hints based on common patterns
            let enhancedError = errorMsg;
            const lowerMsg = errorMsg.toLowerCase();

            if (lowerMsg.includes('mismatched input') || lowerMsg.includes('expected')) {
                if (query.includes(' = ') && !query.includes(' == ')) {
                    enhancedError += "\n\n💡 Tip: Use '==' for equality comparison in ES|QL, not '='. Example: WHERE level == \"error\"";
                } else {
                    enhancedError += "\n\n💡 Tip: Check ES|QL syntax. Commands must be separated by '|' pipes.";
                }
            } else if (!query.trim().toUpperCase().startsWith('FROM')) {
                enhancedError += "\n\n💡 Tip: ES|QL queries must start with FROM. Example: FROM obs-logs-current | WHERE ...";
            } else if (lowerMsg.includes('no such') || lowerMsg.includes('unknown') || lowerMsg.includes('column')) {
                enhancedError += "\n\n💡 Tip: Check your column names. To see all columns, run: FROM obs-logs-current | LIMIT 1";
            }

            setError(enhancedError);
            saveToHistory(query, false);
            showToast(errorMsg, "error");
        } finally {
            setLoading(false);
        }
    };

    const loadExample = (exampleQuery: string) => {
        setQuery(exampleQuery);
        setShowExamples(false);
        showToast("Example query loaded", "info");
    };

    const loadFromHistory = (historyQuery: string) => {
        setQuery(historyQuery);
        setShowHistory(false);
        showToast("Query loaded from history", "info");
    };

    const clearHistory = () => {
        setQueryHistory([]);
        localStorage.removeItem("esql_query_history");
        setShowHistory(false);
        showToast("History cleared", "info");
    };

    const exportToCSV = () => {
        if (!result) return;

        const headers = result.columns.map(c => c.name).join(",");
        const rows = result.rows.map(row =>
            row.map(cell => {
                if (cell === null) return "";
                const str = String(cell);
                return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
            }).join(",")
        ).join("\n");

        const csv = `${headers}\n${rows}`;
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `esql-results-${new Date().getTime()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("Results exported to CSV", "success");
    };

    const exportToJSON = () => {
        if (!result) return;

        const data = result.rows.map(row => {
            const obj: Record<string, string | number | boolean | null> = {};
            result.columns.forEach((col, idx) => {
                obj[col.name] = row[idx];
            });
            return obj;
        });

        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `esql-results-${new Date().getTime()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("Results exported to JSON", "success");
    };

    const copyToClipboard = () => {
        if (!result) return;

        const data = result.rows.map(row => {
            const obj: Record<string, string | number | boolean | null> = {};
            result.columns.forEach((col, idx) => {
                obj[col.name] = row[idx];
            });
            return obj;
        });

        navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        showToast("Results copied to clipboard", "success");
    };

    const formatCellValue = (value: string | number | boolean | null, type: string): React.ReactNode => {
        if (value === null || value === undefined) {
            return <span className="text-muted/60 italic text-xs">(null)</span>;
        }

        if (type === "date" && typeof value === "string") {
            try {
                const date = new Date(value);
                return <span className="text-blue-400">{date.toLocaleString()}</span>;
            } catch {
                return String(value);
            }
        }

        if (type === "keyword" || type === "text") {
            return <span className="text-green-400">{String(value)}</span>;
        }

        if (type === "long" || type === "integer" || type === "double") {
            return <span className="text-yellow-400">{String(value)}</span>;
        }

        if (type === "boolean") {
            return <span className={value ? "text-green-400" : "text-red-400"}>{String(value)}</span>;
        }

        return String(value);
    };

    const handleSort = (columnIndex: number) => {
        if (sortColumn === columnIndex) {
            setSortDirection(sortDirection === "asc" ? "desc" : "asc");
        } else {
            setSortColumn(columnIndex);
            setSortDirection("asc");
        }
    };

    const getSortedRows = () => {
        if (!result || sortColumn === null) return result?.rows || [];

        const sorted = [...result.rows].sort((a, b) => {
            const aVal = a[sortColumn];
            const bVal = b[sortColumn];

            if (aVal === null && bVal === null) return 0;
            if (aVal === null) return 1;
            if (bVal === null) return -1;

            if (typeof aVal === "number" && typeof bVal === "number") {
                return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
            }

            const aStr = String(aVal);
            const bStr = String(bVal);
            return sortDirection === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
        });

        return sorted;
    };

    return (
        <div className={`space-y-4 ${className}`}>
            {/* Toast Notifications */}
            <div className="fixed top-4 right-4 z-50 space-y-2">
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        className={`
                            px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[300px]
                            animate-in slide-in-from-right duration-300
                            ${toast.type === "success" ? "bg-green-500/20 border border-green-500/50 text-green-400" : ""}
                            ${toast.type === "error" ? "bg-red-500/20 border border-red-500/50 text-red-400" : ""}
                            ${toast.type === "info" ? "bg-blue-500/20 border border-blue-500/50 text-blue-400" : ""}
                        `}
                    >
                        {toast.type === "success" && <CheckIcon className="w-5 h-5" />}
                        {toast.type === "error" && <XCircleIcon className="w-5 h-5" />}
                        <span className="text-sm flex-1">{toast.message}</span>
                    </div>
                ))}
            </div>

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-foreground">ES|QL Query Console</h2>
                    <p className="text-sm text-muted">Explore your data with Elasticsearch Query Language</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => { setShowHistory(!showHistory); setShowExamples(false); }}
                        className="btn-secondary flex items-center gap-2"
                    >
                        <HistoryIcon className="w-4 h-4" />
                        History
                        {queryHistory.length > 0 && (
                            <span className="bg-primary text-background text-xs px-2 py-0.5 rounded-full">
                                {queryHistory.length}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => { setShowExamples(!showExamples); setShowHistory(false); }}
                        className="btn-secondary flex items-center gap-2"
                    >
                        <BookOpenIcon className="w-4 h-4" />
                        Examples
                    </button>
                </div>
            </div>

            {/* History Panel */}
            {showHistory && (
                <div className="card border border-border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-foreground">Query History</h4>
                        {queryHistory.length > 0 && (
                            <button
                                onClick={clearHistory}
                                className="text-xs text-red-400 hover:text-red-300"
                            >
                                Clear All
                            </button>
                        )}
                    </div>
                    {queryHistory.length === 0 ? (
                        <p className="text-sm text-muted/50">No queries in history yet</p>
                    ) : (
                        <div className="space-y-1 max-h-64 overflow-y-auto">
                            {queryHistory.map((item, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-start gap-2 px-3 py-2 rounded hover:bg-accent cursor-pointer group"
                                    onClick={() => loadFromHistory(item.query)}
                                >
                                    <div className={`w-2 h-2 rounded-full mt-1.5 ${item.success ? "bg-green-500" : "bg-red-500"}`} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-mono text-muted group-hover:text-foreground truncate">
                                            {item.query}
                                        </p>
                                        <p className="text-xs text-muted/50">
                                            {new Date(item.timestamp).toLocaleTimeString()}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Examples Panel */}
            {showExamples && (
                <div className="card border border-border p-4 space-y-3">
                    {Object.entries(examples).map(([category, categoryExamples]) => (
                        <div key={category}>
                            <h4 className="text-sm font-medium text-foreground capitalize mb-2">{category}</h4>
                            <div className="space-y-1">
                                {categoryExamples.map((ex, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => loadExample(ex.query)}
                                        className="w-full text-left px-3 py-2 rounded hover:bg-accent text-sm text-muted hover:text-foreground transition-colors"
                                    >
                                        {ex.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Query Editor */}
            <div className="card border border-border p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted">
                    <SearchIcon className="w-4 h-4" />
                    <span>Enter your ES|QL query</span>
                </div>
                <textarea
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="FROM obs-logs-current | WHERE level == &quot;error&quot; | STATS count() BY service.name"
                    className="w-full h-32 px-4 py-3 bg-background border border-border rounded-lg text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            executeQuery();
                        }
                    }}
                />
                <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">
                        Press <kbd className="px-2 py-1 bg-accent rounded text-xs">Cmd+Enter</kbd> to execute
                    </span>
                    <button
                        onClick={executeQuery}
                        disabled={loading || !query.trim()}
                        className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <>
                                <div className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
                                Executing...
                            </>
                        ) : (
                            <>
                                <PlayIcon className="w-4 h-4" />
                                Run Query
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Error Display */}
            {error && (
                <div className="card border border-red-500/50 bg-red-500/10 p-4 space-y-3">
                    <div className="flex items-start gap-3">
                        <XCircleIcon className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <p className="text-sm font-medium text-red-400">Query Error</p>
                            {typeof error === 'object' && error !== null && 'message' in error ? (
                                <div className="mt-2 space-y-2">
                                    <p className="text-sm text-red-300">{(error as { message: string }).message}</p>
                                    {(error as { line?: number; column?: number }).line && (
                                        <p className="text-xs text-red-400/70 font-mono">
                                            Line {(error as { line: number }).line}, Column {(error as { column?: number }).column}
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <p className="text-sm text-red-400/80 mt-1">{String(error)}</p>
                            )}
                        </div>
                    </div>

                    {/* Helpful Suggestion */}
                    {typeof error === 'object' && error !== null && 'suggestion' in error && (error as { suggestion?: string }).suggestion && (
                        <div className="border-t border-red-500/20 pt-3">
                            <p className="text-sm text-red-300/90">
                                {(error as { suggestion: string }).suggestion}
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Results Table */}
            {result && (
                <div className="card border border-border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                            <CheckIcon className="w-4 h-4 text-green-500" />
                            Results
                            <span className="text-muted">
                                ({result.total_rows} rows in {result.took_ms}ms)
                            </span>
                        </h3>
                        <div className="flex gap-2">
                            <button
                                onClick={copyToClipboard}
                                className="btn-secondary flex items-center gap-2 text-xs"
                                title="Copy to clipboard"
                            >
                                <CopyIcon className="w-3.5 h-3.5" />
                                Copy
                            </button>
                            <button
                                onClick={exportToCSV}
                                className="btn-secondary flex items-center gap-2 text-xs"
                                title="Export as CSV"
                            >
                                <DownloadIcon className="w-3.5 h-3.5" />
                                CSV
                            </button>
                            <button
                                onClick={exportToJSON}
                                className="btn-secondary flex items-center gap-2 text-xs"
                                title="Export as JSON"
                            >
                                <DownloadIcon className="w-3.5 h-3.5" />
                                JSON
                            </button>
                        </div>
                    </div>
                    <div className="overflow-x-auto border border-border rounded-lg">
                        <table className="w-full text-sm">
                            <thead className="bg-accent/50 sticky top-0">
                                <tr className="border-b border-border">
                                    {result.columns.map((col, idx) => (
                                        <th
                                            key={idx}
                                            className="text-left px-4 py-3 font-medium text-foreground cursor-pointer hover:bg-accent select-none"
                                            onClick={() => handleSort(idx)}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span>{col.name}</span>
                                                <span className="text-xs text-muted">({col.type})</span>
                                                {sortColumn === idx && (
                                                    <span className="text-primary">{sortDirection === "asc" ? "↑" : "↓"}</span>
                                                )}
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {getSortedRows().map((row, rowIdx) => (
                                    <tr
                                        key={rowIdx}
                                        className={`
                                            border-b border-border/50 hover:bg-accent/50 transition-colors
                                            ${rowIdx % 2 === 0 ? "bg-background" : "bg-accent/20"}
                                        `}
                                    >
                                        {row.map((cell, cellIdx) => (
                                            <td key={cellIdx} className="px-4 py-2.5 font-mono text-xs">
                                                {formatCellValue(cell, result.columns[cellIdx].type)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
