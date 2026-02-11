import { useCallback, useEffect, useState } from "react";
import { useObservabilityApi } from "./useObservabilityApi";
import { useCopilotStore } from "../store/copilotStore";

export function useDashboard() {
    const { fetchWithAuth } = useObservabilityApi();
    const setApiInvestigations = useCopilotStore(state => state.setApiInvestigations);
    const setServiceHealth = useCopilotStore(state => state.setServiceHealth);
    const setRecentFindings = useCopilotStore(state => state.setRecentFindings);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadDashboardData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [invRes, healthRes, findingsRes] = await Promise.all([
                fetchWithAuth("/investigations"),
                fetchWithAuth("/service-health"),
                fetchWithAuth("/findings/recent?limit=5"),
            ]);

            if (invRes && invRes.ok) {
                const data = await invRes.json();
                setApiInvestigations(data.investigations || []);
            }
            if (healthRes && healthRes.ok) {
                const data = await healthRes.json();
                setServiceHealth(data.services || []);
            }
            if (findingsRes && findingsRes.ok) {
                const data = await findingsRes.json();
                setRecentFindings(data.findings || []);
            }
        } catch (err) {
            console.error("Failed to load dashboard data", err);
            setError("Failed to load dashboard data");
        } finally {
            setLoading(false);
        }
    }, [fetchWithAuth, setApiInvestigations, setServiceHealth, setRecentFindings]);

    useEffect(() => {
        // Only load if not already loaded? Or always fresh? 
        // For now, load on mount. 
        loadDashboardData();
    }, [loadDashboardData]);

    return { loading, error, refresh: loadDashboardData };
}
