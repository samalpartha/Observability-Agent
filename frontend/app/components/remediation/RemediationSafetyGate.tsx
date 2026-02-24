"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AlertTriangleIcon, ShieldCheckIcon } from "../Icons";

export interface Remediation {
    action: string;
    risk_level: "low" | "medium" | "high" | "critical";
    reversible?: boolean;
    safety_note?: string;
    requires_confirmation?: boolean;
}

interface Reflection {
    status: string;
    criticism: string;
    modifier: number;
}

interface RemediationSafetyGateProps {
    remediations: Remediation[];
    reflection?: Reflection;
    runId?: string;
    onExecute?: (remediation: Remediation) => Promise<void>;
}

const RISK_STYLES: Record<string, string> = {
    low: "border-emerald-500/30 bg-emerald-500/5",
    medium: "border-amber-500/30 bg-amber-500/5",
    high: "border-rose-500/30 bg-rose-500/5",
    critical: "border-rose-600/50 bg-rose-600/10",
};

const RISK_BADGE_VARIANT: Record<string, "success" | "warning" | "destructive" | "default"> = {
    low: "success",
    medium: "warning",
    high: "destructive",
    critical: "destructive",
};

export function RemediationSafetyGate({
    remediations,
    reflection,
    onExecute,
}: RemediationSafetyGateProps) {
    const [confirming, setConfirming] = useState<number | null>(null);
    const [executing, setExecuting] = useState<number | null>(null);
    const [executed, setExecuted] = useState<Set<number>>(new Set());

    const handleConfirm = (idx: number) => {
        setConfirming(idx);
    };

    const handleCancel = () => {
        setConfirming(null);
    };

    const handleExecute = async (remediation: Remediation, idx: number) => {
        setExecuting(idx);
        try {
            if (onExecute) {
                await onExecute(remediation);
            }
            setExecuted((prev) => new Set(prev).add(idx));
        } catch {
            // silently fail for now – log it for observability
            console.error("Remediation execution failed");
        } finally {
            setExecuting(null);
            setConfirming(null);
        }
    };

    if (!remediations || remediations.length === 0) {
        return null;
    }

    return (
        <div className="space-y-4">
            {/* Header Banner */}
            <div className="flex items-center gap-3 p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5">
                <ShieldCheckIcon className="w-5 h-5 text-indigo-400 flex-shrink-0" />
                <div className="flex-1">
                    <p className="font-semibold text-sm text-indigo-100">Remediation Safety Gate</p>
                    <p className="text-xs text-indigo-200/50">
                        Review each action carefully. High-risk and irreversible actions require explicit confirmation.
                    </p>
                </div>
                {reflection && (
                    <Badge
                        variant={reflection.status === "Logical" ? "success" : "warning"}
                        className="text-xs shrink-0"
                    >
                        Critic: {reflection.status}
                    </Badge>
                )}
            </div>

            {/* Critic Warning (if skeptical) */}
            {reflection && reflection.status !== "Logical" && (
                <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 flex items-start gap-3">
                    <AlertTriangleIcon className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-200/80 leading-relaxed">
                        <span className="font-bold text-amber-300">Critic Alert: </span>
                        {reflection.criticism}
                    </div>
                </div>
            )}

            {/* Remediation Cards */}
            {remediations.map((rem, idx) => {
                const isExecuted = executed.has(idx);
                const isConfirming = confirming === idx;
                const isExecuting = executing === idx;
                const riskClass = RISK_STYLES[rem.risk_level] ?? RISK_STYLES.medium;

                return (
                    <Card
                        key={idx}
                        className={cn(
                            "border transition-all duration-300",
                            riskClass,
                            isExecuted ? "opacity-50" : ""
                        )}
                    >
                        <CardHeader className="pb-2">
                            <div className="flex items-start justify-between gap-4">
                                <CardTitle className="text-sm font-mono leading-relaxed text-white/80">
                                    {isExecuted ? <s>{rem.action}</s> : rem.action}
                                </CardTitle>
                                <div className="flex items-center gap-2 shrink-0">
                                    <Badge variant={RISK_BADGE_VARIANT[rem.risk_level] ?? "default"} className="text-xs uppercase font-bold tracking-wider">
                                        {rem.risk_level}
                                    </Badge>
                                    {rem.reversible === false && (
                                        <Badge variant="destructive" className="text-xs font-bold">Irreversible</Badge>
                                    )}
                                </div>
                            </div>
                            <CardDescription className="text-xs mt-1">
                                {rem.safety_note}
                            </CardDescription>
                        </CardHeader>

                        <CardFooter className="pt-2 gap-2 flex flex-wrap">
                            {isExecuted ? (
                                <span className="text-xs text-emerald-400 font-semibold">✅ Executed</span>
                            ) : isConfirming ? (
                                <>
                                    <span className="text-xs text-rose-300 font-medium mr-auto">
                                        Are you sure? This cannot be undone.
                                    </span>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="text-xs text-white/50 hover:text-white"
                                        onClick={handleCancel}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        size="sm"
                                        className="text-xs bg-rose-600 hover:bg-rose-700 text-white"
                                        onClick={() => handleExecute(rem, idx)}
                                        disabled={isExecuting}
                                    >
                                        {isExecuting ? "Executing..." : "Confirm & Execute"}
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-xs ml-auto border-white/10 bg-transparent text-white/70 hover:text-white"
                                        onClick={() => rem.requires_confirmation ? handleConfirm(idx) : handleExecute(rem, idx)}
                                    >
                                        {rem.requires_confirmation ? "⚠️ Execute (Requires Confirmation)" : "▶ Execute Action"}
                                    </Button>
                                </>
                            )}
                        </CardFooter>
                    </Card>
                );
            })}
        </div>
    );
}
