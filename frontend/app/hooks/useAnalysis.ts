import { useRef, useCallback } from "react";
import { useObservabilityApi } from "./useObservabilityApi";
import { useCopilotStore } from "../store/copilotStore";

export function useAnalysis() {
    const { fetchWithAuth } = useObservabilityApi();
    const {
        setLoading, setRunStatus, setError, setResult, setActiveStep, setStatusMessage,
        runHistory, setRunHistory, question, service, env, timePreset
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

                // SSE events are delimited by double newlines
                let boundary = buffer.indexOf("\n\n");
                while (boundary !== -1) {
                    const rawEvent = buffer.slice(0, boundary);
                    buffer = buffer.slice(boundary + 2);

                    let eventType = "";
                    let dataStr = "";
                    for (const line of rawEvent.split("\n")) {
                        if (line.startsWith("event: ")) {
                            eventType = line.slice(7).trim();
                        } else if (line.startsWith("data: ")) {
                            dataStr += line.slice(6);
                        } else if (line.startsWith(":")) {
                            // comment / keepalive, ignore
                        }
                    }

                    if (eventType && dataStr) {
                        try {
                            const eventData = JSON.parse(dataStr);
                            if (eventType === "stage" && typeof eventData.index === "number") {
                                setActiveStep(eventData.index);
                            } else if (eventType === "progress") {
                                setStatusMessage(eventData.message);
                            } else if (eventType === "result") {
                                setResult(eventData);
                                setRunStatus("complete");
                                setStatusMessage(null);

                                // Append to run history
                                const newRecord = {
                                    runId: eventData.run_id || Math.random().toString(36).substring(7),
                                    question,
                                    service,
                                    env,
                                    timeRange: timePreset,
                                    status: "complete",
                                    completedAt: new Date().toISOString(),
                                    result: eventData
                                };
                                setRunHistory([...runHistory, newRecord]);
                            } else if (eventType === "error") {
                                throw new Error(eventData.message || "Analysis failed");
                            }
                        } catch (e) {
                            if (eventType === "error") throw e;
                            console.error("SSE Parse Error", e);
                        }
                    }

                    boundary = buffer.indexOf("\n\n");
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
    }, [fetchWithAuth, setLoading, setRunStatus, setError, setResult, setActiveStep, setStatusMessage, runHistory, setRunHistory, question, service, env, timePreset]);

    const cancelAnalysis = useCallback(() => {
        if (abortRef.current) abortRef.current.abort();
        setLoading(false);
        setRunStatus("idle");
    }, [setLoading, setRunStatus]);

    return { runAnalysis, cancelAnalysis };
}
