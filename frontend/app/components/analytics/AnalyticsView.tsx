"use client";

import React, { useState } from "react";
import { ESQLQueryPanel } from "./ESQLQueryPanel";
import { SearchIcon, BarChart3Icon, SparklesIcon } from "../Icons";

type AnalyticsTab = "esql" | "dashboards" | "ai-assistant";

export function AnalyticsView() {
    const [activeTab, setActiveTab] = useState<AnalyticsTab>("esql");

    const tabs: { id: AnalyticsTab; label: string; icon: React.ReactNode; description: string }[] = [
        {
            id: "esql",
            label: "ES|QL Queries",
            icon: <SearchIcon className="w-5 h-5" />,
            description: "Query your data with piped query language"
        },
        {
            id: "dashboards",
            label: "Dashboards",
            icon: <BarChart3Icon className="w-5 h-5" />,
            description: "Create interactive visualizations (Coming Soon)"
        },
        {
            id: "ai-assistant",
            label: "AI Assistant",
            icon: <SparklesIcon className="w-5 h-5" />,
            description: "Natural language data exploration (Coming Soon)"
        }
    ];

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="border-b border-border p-6">
                <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
                <p className="text-sm text-muted mt-1">
                    Query, visualize & interact with your Elasticsearch data
                </p>
            </div>

            {/* Tabs */}
            <div className="border-b border-border px-6">
                <div className="flex gap-1">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            disabled={tab.id !== "esql"}
                            className={`
                                flex items-center gap-2 px-4 py-3 border-b-2 transition-colors
                                ${activeTab === tab.id
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted hover:text-foreground"
                                }
                                ${tab.id !== "esql" ? "opacity-50 cursor-not-allowed" : ""}
                            `}
                        >
                            {tab.icon}
                            <span className="font-medium">{tab.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
                {activeTab === "esql" && <ESQLQueryPanel />}

                {activeTab === "dashboards" && (
                    <div className="card border border-border p-8 text-center">
                        <BarChart3Icon className="w-12 h-12 mx-auto text-muted mb-4" />
                        <h3 className="text-lg font-semibold text-foreground mb-2">
                            Dashboards Coming Soon
                        </h3>
                        <p className="text-sm text-muted">
                            Create interactive dashboards with drag-and-drop widgets, real-time data, and custom visualizations.
                        </p>
                    </div>
                )}

                {activeTab === "ai-assistant" && (
                    <div className="card border border-border p-8 text-center">
                        <SparklesIcon className="w-12 h-12 mx-auto text-muted mb-4" />
                        <h3 className="text-lg font-semibold text-foreground mb-2">
                            AI Assistant Coming Soon
                        </h3>
                        <p className="text-sm text-muted">
                            Chat with Elastic AI Assistant to interpret logs, troubleshoot errors, and optimize queries in natural language.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
