import { useRef, useCallback } from "react";
import { useObservabilityApi } from "./useObservabilityApi";
import { useCopilotStore } from "../store/copilotStore";

export function useAnalysis() {
    const { fetchWithAuth } = useObservabilityApi();
    const {
        setLoading, setRunStatus, setError, setResult, setActiveStep, setStatusMessage
    } = useCopilotStore();

    const abortRef = useRef<AbortController | null>(null);

    const runAnalysis = useCallback(async (payload: Record<string, unknown>) => {
        setLoading(true);
        setRunStatus("running");
        setError(null);
        setResult(null);
        setActiveStep(0);
        abortRef.current = new AbortController();

        try {
            // Using fetch for SSE to handle headers easily
            const res = await fetchWithAuth("/debug/stream", {
                method: "POST",
                body: JSON.stringify(payload),
                signal: abortRef.current?.signal,
            });

            if (!res || !res.ok) {
                // Fallback or error handling handled by fetchWithAuth or here
                if (res && !res.ok) {
                    const text = await res.text();
                    let message = text;
                    try { const j = JSON.parse(text); if (j.detail) message = j.detail; } catch { }
                    throw new Error(message || "Analysis request failed");
                }
                return;
            }

            const reader = res.body?.getReader();
            const decoder = new TextDecoder();
            if (!reader) throw new Error("Stream not available");

            let buffer = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                let eventType = "";
                for (const line of lines) {
                    if (line.startsWith("event: ")) {
                        eventType = line.slice(7).trim();
                    } else if (line.startsWith("data: ") && eventType) {
                        try {
                            const eventData = JSON.parse(line.slice(6));
                            if (eventType === "stage" && typeof eventData.index === "number") {
                                setActiveStep(eventData.index);
                            } else if (eventType === "progress") {
                                setStatusMessage(eventData.message);
                            } else if (eventType === "result") {
                                setResult(eventData);
                                setRunStatus("complete");
                                setStatusMessage(null);
                            } else if (eventType === "error") {
                                throw new Error(eventData.message || "Analysis failed");
                            }
                        } catch (e) {
                            console.error("SSE Parse Error", e);
                        }
                        eventType = "";
                    }
                }
            }

        } catch (err: unknown) {
            if (err instanceof Error && err.name === "AbortError") return;
            setError(err instanceof Error ? err.message : "Request failed");
            setRunStatus("failed");
        } finally {
            setLoading(false);
            abortRef.current = null;
        }
    }, [fetchWithAuth, setLoading, setRunStatus, setError, setResult, setActiveStep, setStatusMessage]);

    const cancelAnalysis = useCallback(() => {
        if (abortRef.current) abortRef.current.abort();
        setLoading(false);
        setRunStatus("idle");
    }, [setLoading, setRunStatus]);

    return { runAnalysis, cancelAnalysis };
}
