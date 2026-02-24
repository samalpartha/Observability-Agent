"use client";

import React, { useState } from "react";
import { XIcon } from "../Icons";

interface KibanaDashboardProps {
    kibanaUrl: string;
}

export function KibanaDashboard({ kibanaUrl }: KibanaDashboardProps) {
    const [selectedDashboard, setSelectedDashboard] = useState<string | null>(null);

    const dashboards = [
        {
            id: "observability-overview",
            name: "Observability Overview",
            path: "/app/dashboards#/view/observability-overview",
            description: "High-level overview of system health and performance"
        },
        {
            id: "logs",
            name: "Logs Explorer",
            path: "/app/logs/stream",
            description: "Stream and search application logs"
        },
        {
            id: "apm",
            name: "APM Services",
            path: "/app/apm/services",
            description: "Application performance monitoring"
        },
        {
            id: "metrics",
            name: "Infrastructure Metrics",
            path: "/app/metrics/inventory",
            description: "Infrastructure metrics and inventory"
        },
        {
            id: "uptime",
            name: "Uptime Monitoring",
            path: "/app/uptime",
            description: "Service uptime and availability"
        }
    ];

    return (
        <div className="h-full flex flex-col">
            {selectedDashboard ? (
                <div className="flex-1 flex flex-col">
                    <div className="flex items-center justify-between p-4 border-b border-border bg-card">
                        <h3 className="font-semibold text-foreground">
                            {dashboards.find(d => d.id === selectedDashboard)?.name}
                        </h3>
                        <button
                            onClick={() => setSelectedDashboard(null)}
                            className="p-2 hover:bg-muted rounded-lg transition-colors"
                        >
                            <XIcon className="w-5 h-5 text-muted" />
                        </button>
                    </div>
                    <div className="flex-1 relative">
                        <iframe
                            src={`${kibanaUrl}${dashboards.find(d => d.id === selectedDashboard)?.path}`}
                            className="absolute inset-0 w-full h-full border-0"
                            title={dashboards.find(d => d.id === selectedDashboard)?.name}
                        />
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {dashboards.map((dashboard) => (
                        <button
                            key={dashboard.id}
                            onClick={() => setSelectedDashboard(dashboard.id)}
                            className="card border border-border p-6 text-left hover:border-primary transition-colors group"
                        >
                            <h3 className="text-lg font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
                                {dashboard.name}
                            </h3>
                            <p className="text-sm text-muted">
                                {dashboard.description}
                            </p>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
