
import { useCallback } from "react";
import { useCopilotStore } from "../store/copilotStore";
import { useObservabilityApi } from "./useObservabilityApi";

export function useCaseManagement() {
    const {
        result,
        setCreateCaseLoading,
        setCreateCaseError,
        setCreatedCaseUrl,
    } = useCopilotStore();
    const { fetchWithAuth } = useObservabilityApi();

    const createCase = useCallback(async () => {
        if (!result) return;

        setCreateCaseLoading(true);
        setCreateCaseError(null);
        setCreatedCaseUrl(null);

        try {
            // Prepare case body
            const findingsText = result.findings
                .map((f) => `- ${f.message}`)
                .join("\n");
            const rootCause = result.root_cause_candidates?.[0] || "Unknown";
            const description = `**Root Cause**: ${rootCause}\n\n**Findings**:\n${findingsText}\n\n**Executive Summary**:\n${result.executive_summary
                ?.map((s) => s.text)
                .join("\n")}`;

            const body = {
                title: `Observability Copilot: ${rootCause}`.slice(0, 100),
                description,
                tags: ["observability-copilot", "ai-generated"],
                severity: "medium",
                evidence_comment: "Created by Observability Copilot",
            };

            const res = await fetchWithAuth("/cases", {
                method: "POST",
                body: JSON.stringify(body),
            });

            if (!res) return; // Auth redirect handled in hook

            if (!res.ok) {
                throw new Error(`Failed to create case: ${res.statusText}`);
            }

            const data = await res.json();
            if (data.case_url) {
                setCreatedCaseUrl(data.case_url);
            } else {
                throw new Error("Case created but no URL returned");
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            setCreateCaseError(message || "Failed to create case");
        } finally {
            setCreateCaseLoading(false);
        }
    }, [result, fetchWithAuth, setCreateCaseLoading, setCreateCaseError, setCreatedCaseUrl]);

    return { createCase };
}
