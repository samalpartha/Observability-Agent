import { useCallback } from "react";
import { getToken, clearAuth } from "../lib/auth";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8765";

export function useObservabilityApi() {
    const router = useRouter();

    const fetchWithAuth = useCallback(async (endpoint: string, options: RequestInit = {}) => {
        const token = getToken();
        if (!token) {
            router.replace("/login");
            return null;
        }

        const headers = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...options.headers,
        };

        try {
            const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
            if (res.status === 401) {
                clearAuth();
                router.replace("/login");
                return null;
            }
            return res;
        } catch (error) {
            console.error("API Error:", error);
            throw error;
        }
    }, [router]);

    return { fetchWithAuth, API_URL };
}
