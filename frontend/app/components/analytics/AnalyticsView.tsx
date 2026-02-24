"use client";

import React, { useState } from "react";
import { ESQLQueryPanel } from "./ESQLQueryPanel";
import { KibanaDashboard } from "./KibanaDashboard";
import { AIDataExplorer } from "./AIDataExplorer";
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
            description: "View Kibana dashboards and visualizations"
        },
        {
            id: "ai-assistant",
            label: "AI Assistant",
            icon: <SparklesIcon className="w-5 h-5" />,
            description: "Natural language data exploration"
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
                            className={`
                                flex items-center gap-2 px-4 py-3 border-b-2 transition-colors
                                ${activeTab === tab.id
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted hover:text-foreground"
                                }
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
                {activeTab === "dashboards" && <KibanaDashboard kibanaUrl={process.env.NEXT_PUBLIC_KIBANA_URL || "https://my-elasticsearch-project-c5ba52.kb.us-central1.gcp.elastic.cloud"} />}
                {activeTab === "ai-assistant" && <AIDataExplorer />}
            </div>
        </div>
    );
}
