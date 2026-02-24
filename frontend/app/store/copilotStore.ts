/**
 * Zustand store — single source of truth for all app state.
 * Replaces the 50+ useState calls in page.tsx.
 */
import { create } from "zustand";

// ── localStorage persistence helpers ──
const LS_HISTORY_KEY = "obs_run_history";
const LS_PROMPTS_KEY = "obs_saved_prompts";
const MAX_HISTORY = 50;

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage quota exceeded — silently fail
  }
}

// ── Types ──

export type SourceRow = {
  id: string;
  label: string;
  status: "connected" | "degraded" | "disconnected";
  last_check: string | null;
  error: string | null;
};

export type SavedPrompt = {
  id: string;
  name: string;
  question: string;
  service?: string;
  env?: string;
  timePreset?: string;
  filters?: Record<string, string>;
};

export type RunRecord = {
  runId: string;
  question: string;
  service?: string;
  env?: string;
  timeRange?: string;
  status: string;
  completedAt: string;
  result?: DebugResponse;
  runDelta?: { signalsAdded?: number; confidenceDelta?: number; missingResolved?: string[]; rootCauseChanged?: boolean };
};

export type DebugResponse = {
  run_id: string;
  status: string;
  executive_summary: Array<{ text: string; confidence?: number }>;
  findings: Array<{ message?: string; links?: Array<{ label: string; url: string }>; "@timestamp"?: string; "trace.id"?: string }>;
  proposed_fixes: Array<{ action?: string; risk_level?: string; reversible?: boolean; safety_note?: string; requires_confirmation?: boolean }>;
  confidence: number;
  confidence_reasons: string[];
  evidence_links: Array<{ label?: string; url?: string }>;
  root_cause_candidates: string[];
  similar_incidents?: Array<{ incident_id?: string; title?: string; root_cause?: string; fix_steps?: string; score?: number }>;
  scope?: Record<string, unknown>;
  evidence_by_type?: { logs?: unknown[]; traces?: unknown[]; metrics?: unknown[]; alerts?: unknown[]; cases?: unknown[] };
  kibana_discover_url?: string | null;
  kibana_apm_url?: string | null;
  confidence_tier?: string;
  next_steps?: string[];
  signal_contributions?: Record<string, number>;
  attempt_number?: number;
  attempt_message?: string;
  missing_signals?: string[];
  pipeline_artifacts?: { signals_gathered?: Record<string, number>; signals_total?: number; correlation_score?: number; gather_complete?: boolean; correlate_complete?: boolean; root_cause_complete?: boolean };
  root_cause_states?: Array<{ text: string; state: string }>;
  run_delta?: { signals_added?: number; confidence_delta?: number; missing_resolved?: string[]; root_cause_changed?: boolean };
  reflection?: { status: string; criticism: string; modifier: number } | null;
};

export type RealMetrics = {
  latency_p50_ms: number | null;
  latency_p95_ms: number | null;
  latency_p99_ms: number | null;
  throughput_per_min: number | null;
  error_rate_pct: number | null;
  total_events: number;
};

type RunStatus = "idle" | "queued" | "running" | "complete" | "failed";
type ResultTab = "summary" | "evidence" | "timeline" | "actions";
type EvidenceTab = "logs" | "metrics" | "traces" | "alerts" | "cases";

// ── Store ──

interface CopilotState {
  // Auth / mount
  mounted: boolean;
  setMounted: (v: boolean) => void;

  // Query
  question: string;
  setQuestion: (v: string) => void;
  service: string;
  setService: (v: string) => void;
  env: string;
  setEnv: (v: string) => void;
  timePreset: string;
  setTimePreset: (v: string) => void;

  // Advanced filters
  advancedOpen: boolean;
  setAdvancedOpen: (v: boolean) => void;
  region: string;
  setRegion: (v: string) => void;
  version: string;
  setVersion: (v: string) => void;
  deployId: string;
  setDeployId: (v: string) => void;
  traceId: string;
  setTraceId: (v: string) => void;
  tenant: string;
  setTenant: (v: string) => void;
  endpoint: string;
  setEndpoint: (v: string) => void;

  // Run state
  loading: boolean;
  setLoading: (v: boolean) => void;
  runStatus: RunStatus;
  setRunStatus: (v: RunStatus) => void;
  error: string | null;
  setError: (v: string | null) => void;
  result: DebugResponse | null;
  setResult: (v: DebugResponse | null) => void;
  activeStep: number;
  setActiveStep: (v: number) => void;
  statusMessage: string | null;
  setStatusMessage: (v: string | null) => void;
  validationError: string | null;
  setValidationError: (v: string | null) => void;

  // Sources
  scopeOptions: { services: string[]; envs: string[] };
  setScopeOptions: (v: { services: string[]; envs: string[] }) => void;
  sourcesList: SourceRow[];
  setSourcesList: (v: SourceRow[]) => void;
  sourceTestingId: string | null;
  setSourceTestingId: (v: string | null) => void;

  // History
  runHistory: RunRecord[];
  setRunHistory: (v: RunRecord[]) => void;
  clearHistory: () => void;
  showHistory: boolean;
  setShowHistory: (v: boolean) => void;
  viewingRunId: string | null;
  setViewingRunId: (v: string | null) => void;
  historySearch: string;
  setHistorySearch: (v: string) => void;

  // Saved prompts
  savedPrompts: SavedPrompt[];
  setSavedPrompts: (v: SavedPrompt[]) => void;
  showSaveModal: boolean;
  setShowSaveModal: (v: boolean) => void;
  savePromptName: string;
  setSavePromptName: (v: string) => void;

  // Compare
  compareRunIdA: string | null;
  setCompareRunIdA: (v: string | null) => void;
  compareRunIdB: string | null;
  setCompareRunIdB: (v: string | null) => void;

  // Tabs
  resultTab: ResultTab;
  setResultTab: (v: ResultTab) => void;
  evidenceTab: EvidenceTab;
  setEvidenceTab: (v: EvidenceTab) => void;

  // UI
  toast: string | null;
  setToast: (v: string | null) => void;
  showHelp: boolean;
  setShowHelp: (v: boolean) => void;
  helpFilter: string;
  setHelpFilter: (v: string) => void;
  expandedFlow: string | null;
  setExpandedFlow: (v: string | null) => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (v: boolean) => void;
  liveToggle: boolean;
  setLiveToggle: (v: boolean) => void;
  isListening: boolean;
  setIsListening: (v: boolean) => void;
  currentView: "copilot" | "analytics" | "dashboard";
  setCurrentView: (v: "copilot" | "analytics" | "dashboard") => void;

  // Kibana case
  createCaseLoading: boolean;
  setCreateCaseLoading: (v: boolean) => void;
  createCaseError: string | null;
  setCreateCaseError: (v: string | null) => void;
  createdCaseUrl: string | null;
  setCreatedCaseUrl: (v: string | null) => void;

  // Dashboard
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiInvestigations: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setApiInvestigations: (v: any[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceHealth: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setServiceHealth: (v: any[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recentFindings: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setRecentFindings: (v: any[]) => void;

  // Real metrics
  realMetrics: RealMetrics | null;
  setRealMetrics: (v: RealMetrics | null) => void;

  // Reset for new analysis
  resetForNewRun: () => void;
}

export const useCopilotStore = create<CopilotState>((set) => ({
  // Auth
  mounted: false,
  setMounted: (v) => set({ mounted: v }),

  // Query
  question: "",
  setQuestion: (v) => set({ question: v }),
  service: "",
  setService: (v) => set({ service: v }),
  env: "",
  setEnv: (v) => set({ env: v }),
  timePreset: "1h",
  setTimePreset: (v) => set({ timePreset: v }),

  // Advanced
  advancedOpen: false,
  setAdvancedOpen: (v) => set({ advancedOpen: v }),
  region: "",
  setRegion: (v) => set({ region: v }),
  version: "",
  setVersion: (v) => set({ version: v }),
  deployId: "",
  setDeployId: (v) => set({ deployId: v }),
  traceId: "",
  setTraceId: (v) => set({ traceId: v }),
  tenant: "",
  setTenant: (v) => set({ tenant: v }),
  endpoint: "",
  setEndpoint: (v) => set({ endpoint: v }),

  // Run
  loading: false,
  setLoading: (v) => set({ loading: v }),
  runStatus: "idle",
  setRunStatus: (v) => set({ runStatus: v }),
  error: null,
  setError: (v) => set({ error: v }),
  result: null,
  setResult: (v) => set({ result: v }),
  activeStep: 0,
  setActiveStep: (v) => set({ activeStep: v }),
  statusMessage: null,
  setStatusMessage: (v) => set({ statusMessage: v }),
  validationError: null,
  setValidationError: (v) => set({ validationError: v }),

  // Sources
  scopeOptions: { services: [], envs: [] },
  setScopeOptions: (v) => set({ scopeOptions: v }),
  sourcesList: [],
  setSourcesList: (v) => set({ sourcesList: v }),
  sourceTestingId: null,
  setSourceTestingId: (v) => set({ sourceTestingId: v }),

  // History
  runHistory: loadFromStorage<RunRecord[]>(LS_HISTORY_KEY, []),
  setRunHistory: (v) => {
    const capped = v.slice(0, MAX_HISTORY);
    saveToStorage(LS_HISTORY_KEY, capped);
    set({ runHistory: capped });
  },
  clearHistory: () => {
    saveToStorage(LS_HISTORY_KEY, []);
    set({ runHistory: [] });
  },
  showHistory: false,
  setShowHistory: (v) => set({ showHistory: v }),
  viewingRunId: null,
  setViewingRunId: (v) => set({ viewingRunId: v }),
  historySearch: "",
  setHistorySearch: (v) => set({ historySearch: v }),

  // Saved
  savedPrompts: loadFromStorage<SavedPrompt[]>(LS_PROMPTS_KEY, []),
  setSavedPrompts: (v) => {
    saveToStorage(LS_PROMPTS_KEY, v);
    set({ savedPrompts: v });
  },
  showSaveModal: false,
  setShowSaveModal: (v) => set({ showSaveModal: v }),
  savePromptName: "",
  setSavePromptName: (v) => set({ savePromptName: v }),

  // Compare
  compareRunIdA: null,
  setCompareRunIdA: (v) => set({ compareRunIdA: v }),
  compareRunIdB: null,
  setCompareRunIdB: (v) => set({ compareRunIdB: v }),

  // Tabs
  resultTab: "summary",
  setResultTab: (v) => set({ resultTab: v }),
  evidenceTab: "logs",
  setEvidenceTab: (v) => set({ evidenceTab: v }),

  // UI
  toast: null,
  setToast: (v) => set({ toast: v }),
  showHelp: false,
  setShowHelp: (v) => set({ showHelp: v }),
  helpFilter: "all",
  setHelpFilter: (v) => set({ helpFilter: v }),
  expandedFlow: null,
  setExpandedFlow: (v) => set({ expandedFlow: v }),
  mobileMenuOpen: false,
  setMobileMenuOpen: (v) => set({ mobileMenuOpen: v }),
  liveToggle: true,
  setLiveToggle: (v) => set({ liveToggle: v }),
  isListening: false,
  setIsListening: (v) => set({ isListening: v }),
  currentView: "copilot",
  setCurrentView: (v) => set({ currentView: v }),

  // Case
  createCaseLoading: false,
  setCreateCaseLoading: (v) => set({ createCaseLoading: v }),
  createCaseError: null,
  setCreateCaseError: (v) => set({ createCaseError: v }),
  createdCaseUrl: null,
  setCreatedCaseUrl: (v) => set({ createdCaseUrl: v }),

  // Dashboard
  apiInvestigations: [],
  setApiInvestigations: (v) => set({ apiInvestigations: v }),
  serviceHealth: [],
  setServiceHealth: (v) => set({ serviceHealth: v }),
  recentFindings: [],
  setRecentFindings: (v) => set({ recentFindings: v }),

  // Metrics
  realMetrics: null,
  setRealMetrics: (v) => set({ realMetrics: v }),

  // Actions
  resetForNewRun: () => set({
    loading: true,
    runStatus: "running",
    error: null,
    result: null,
    activeStep: 0,
    createdCaseUrl: null,
    createCaseError: null,
  }),
}));
