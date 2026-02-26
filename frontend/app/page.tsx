
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { getToken } from "./lib/auth";
import { useCopilotStore } from "./store/copilotStore";
import { useAnalysis } from "./hooks/useAnalysis";
import { CommandBar } from "./components/views/CommandBar";
import { ResultsView } from "./components/views/ResultsView";
import { HelpPanel } from "./components/HelpPanel";
import { DashboardView } from "./components/views/DashboardView";
import { AnalyticsView } from "./components/analytics/AnalyticsView";
import { Toast } from "./components/Toast";
import { SavePromptModal } from "./components/SavePromptModal";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { MenuIcon, XIcon, CogIcon, HistoryIcon, BarChart3Icon, ShareIcon, DownloadIcon, DashboardIcon, BellIcon, ActivityIcon, DocumentIcon } from "./components/Icons";

type UserFlow = {
  id: string;
  title: string;
  category: "core" | "scope" | "results" | "history" | "nav" | "admin";
  steps: string[];
  shortcut?: string;
};

const HELP_FLOWS: UserFlow[] = [
  // Core
  { id: "1", title: "Run AI Analysis", category: "core", steps: ["Type a question into the search bar (e.g. 'Why is checkout slow?')", "Press Enter or click the Arrow button", "Watch the AI gather signals in real time", "Review root cause candidates, findings, and proposed fixes"], shortcut: "Enter" },
  { id: "2", title: "Voice Input", category: "core", steps: ["Click the Mic icon in the search bar", "Speak your question clearly", "Click Mic again or wait for auto-stop", "The transcribed query will auto-populate"], shortcut: "Space" },
  { id: "3", title: "Use an Existing Investigation", category: "core", steps: ["Scroll down to Active Investigations on the home page", "Click 'Investigate with AI' on any card", "The question is pre-filled from the alert context", "Results appear at the top of the page"] },
  { id: "4", title: "Analyze a Recent Finding", category: "core", steps: ["Scroll to 'Recent Findings' on the right panel", "Click 'ANALYZE FINDING →' on any finding", "AI runs a full investigation for that signal"] },
  // Results
  { id: "5", title: "Read AI Results", category: "results", steps: ["Results show under 4 tabs: Summary, Evidence, Timeline, Actions", "Summary lists root cause candidates and key findings", "Evidence shows raw logs, traces, and metrics", "Actions tab shows proposed fixes with risk ratings"] },
  { id: "6", title: "Apply a Remediation Fix", category: "results", steps: ["Click the 'Actions' tab in the results view", "Review each fix card — check risk level and reversibility", "For safe fixes, click 'Execute Action'", "For high-risk/irreversible fixes, click once to see confirmation prompt, then confirm"] },
  { id: "7", title: "Create a Kibana Case", category: "results", steps: ["After analysis, go to the 'Actions' tab", "Scroll down to 'Operations'", "Click 'Create Case' to log the incident in Kibana"] },
  // Analytics
  { id: "8", title: "Open Analytics", category: "nav", steps: ["Click the bar chart icon (⬛) in the top right", "Or click it again to return to Copilot mode"], shortcut: "Analytics icon" },
  { id: "9", title: "Run an ES|QL Query", category: "nav", steps: ["Open Analytics (bar chart icon)", "Stay on the 'ES|QL Queries' tab", "Type or paste an ES|QL query into the editor", "Click 'Run Query' or press Ctrl+Enter", "Results appear in the table below"] },
  { id: "10", title: "Use AI Data Explorer", category: "nav", steps: ["Open Analytics → click 'AI Assistant' tab", "Type a natural language question about your data", "Click the send button", "View the AI response, Thinking Steps (trace), and Critic analysis"] },
  // History
  { id: "11", title: "View Run History", category: "history", steps: ["Click the Clock icon in the top right", "History panel slides in from the right", "Click any past run to restore the results"], shortcut: "⌘H" },
  { id: "12", title: "Save a Prompt", category: "history", steps: ["Type a frequently used query in the search bar", "Click the bookmark / save icon (if present)", "Give it a name and confirm", "Saved prompts appear in the history panel for quick reuse"] },
  // Admin
  { id: "13", title: "View Settings & Connections", category: "admin", steps: ["Click the Gear icon (⚙️) in the top right", "Settings panel shows Backend API status and Kibana URL", "Sign Out button is at the bottom of the panel"] },
  { id: "14", title: "Sign Out", category: "admin", steps: ["Click the Gear icon in the top right", "Click 'Sign Out' at the bottom of the Settings panel"] },
  // New Phase 3 features
  { id: "15", title: "View My Cases", category: "results", steps: ["Run an analysis, then click the 'Actions' tab", "Scroll down past 'Create Case' to the 'My Cases' section", "See all Kibana Cases with status badges and timestamps", "Click any case to open it directly in Kibana"] },
  { id: "16", title: "Clear Run History", category: "history", steps: ["Click the Clock icon in the top right to open History", "Click the red 'Clear' button next to the title", "All past runs are removed from history and localStorage"] },
  { id: "17", title: "Error Recovery", category: "admin", steps: ["If a panel crashes, an error card appears instead of a blank screen", "Click 'Try Again' to re-render the component", "The rest of the app continues working normally"] },
];

const HELP_CATEGORIES: { key: UserFlow["category"]; label: string }[] = [
  { key: "core", label: "Core" },
  { key: "results", label: "Results" },
  { key: "nav", label: "Analytics" },
  { key: "history", label: "History" },
  { key: "admin", label: "Settings" },
];

function HistoryPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { runHistory, clearHistory, setResult, setQuestion, savedPrompts } = useCopilotStore();
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-80 bg-slate-900 border-l border-slate-800 z-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <HistoryIcon className="w-5 h-5 text-indigo-400" />
            Run History
          </h2>
          <div className="flex items-center gap-1">
            {runHistory.length > 0 && (
              <button
                onClick={clearHistory}
                className="px-2 py-1 text-[10px] text-red-400 hover:bg-red-500/10 rounded transition-colors"
                title="Clear all history"
              >
                Clear
              </button>
            )}
            <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
              <XIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Saved Prompts Section */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              Saved Prompts
            </h3>
            {savedPrompts.length === 0 ? (
              <p className="text-slate-600 text-xs italic px-1">No saved prompts yet.</p>
            ) : (
              <div className="space-y-2">
                {savedPrompts.map((p) => (
                  <div key={p.id} className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-xl flex items-center justify-between group">
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="text-sm font-medium text-slate-200 truncate">{p.name}</p>
                      <p className="text-[10px] text-slate-500 truncate">{p.question}</p>
                    </div>
                    <button
                      onClick={() => { setQuestion(p.question); onClose(); }}
                      className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded shadow-lg shadow-indigo-500/20 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                    >
                      Run
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Run History Section */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Recent Runs</h3>
            {runHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
                <HistoryIcon className="w-8 h-8 text-slate-800" />
                <p className="text-slate-600 text-xs italic">No runs yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {runHistory.slice().reverse().map((run) => (
                  <button
                    key={run.runId}
                    onClick={() => { if (run.result) { setResult(run.result); setQuestion(run.question); onClose(); } }}
                    className="w-full text-left p-3 bg-slate-800/60 hover:bg-slate-800 rounded-xl border border-slate-700/50 hover:border-slate-600 transition-all group"
                  >
                    <p className="text-sm text-slate-200 font-medium line-clamp-2 group-hover:text-white">{run.question}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${run.status === 'complete' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                          }`}>{run.status}</span>
                        <span className="text-xs text-slate-500">{new Date(run.completedAt).toLocaleTimeString()}</span>
                      </div>
                      <button
                        className="px-2 py-0.5 bg-slate-700/50 hover:bg-indigo-500 text-slate-400 hover:text-white rounded text-[10px] font-bold transition-all opacity-0 group-hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); /* Future: comparison logic */ }}
                      >
                        Compare
                      </button>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8765";
  const kibanaUrl = process.env.NEXT_PUBLIC_KIBANA_URL || "Not configured";
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-80 bg-slate-900 border-l border-slate-800 z-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <CogIcon className="w-5 h-5 text-indigo-400" />
            Settings
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Connection Info */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Connections</h3>
            <div className="space-y-3">
              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
                <p className="text-xs text-slate-500 mb-1">Backend API</p>
                <p className="text-sm font-mono text-emerald-400 break-all">{backendUrl}</p>
                <div className="flex items-center gap-1.5 mt-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs text-emerald-400">Connected</span>
                </div>
              </div>
              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
                <p className="text-xs text-slate-500 mb-1">Kibana / Elasticsearch</p>
                <p className="text-sm font-mono text-slate-300 break-all">{kibanaUrl.slice(0, 50)}{kibanaUrl.length > 50 ? "…" : ""}</p>
              </div>
            </div>
          </div>

          {/* Preferences */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Preferences</h3>
            <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-700/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Dark Mode</span>
                <div className="w-10 h-5 bg-indigo-600 rounded-full flex items-center px-0.5">
                  <div className="w-4 h-4 bg-white rounded-full ml-auto" />
                </div>
              </div>
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-sm">Auto-refresh</span>
                <span className="text-xs">Coming soon</span>
              </div>
            </div>
          </div>

          {/* About */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">About</h3>
            <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-700/30 space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500">Version</span>
                <span className="text-slate-300">1.0.0-hackathon</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">AI Engine</span>
                <span className="text-indigo-400">Gemini 2.0 Flash</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Agent Mode</span>
                <span className="text-emerald-400">Multi-Agent Mesh</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-slate-800">
          <button
            onClick={() => { localStorage.clear(); window.location.href = "/login"; }}
            className="w-full py-2 px-4 bg-slate-800 hover:bg-red-500/10 hover:text-red-400 text-slate-400 text-sm font-medium rounded-lg transition-colors border border-slate-700 hover:border-red-500/30"
          >
            Sign Out
          </button>
        </div>
      </div>
    </>
  );
}

export default function Home() {
  const router = useRouter();
  const {
    mounted, setMounted,
    loading, isListening, setIsListening,
    showHelp, setShowHelp,
    result,
    showSaveModal, setShowSaveModal,
    question,
    showHistory, setShowHistory,
    mobileMenuOpen, setMobileMenuOpen,
    setRunHistory, savedPrompts, setSavedPrompts,
    toast, setToast,
    currentView, setCurrentView
  } = useCopilotStore();

  const [promptName, setPromptName] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const { runAnalysis } = useAnalysis();

  useEffect(() => {
    setMounted(true);
    const history = localStorage.getItem("obs_run_history");
    if (history) setRunHistory(JSON.parse(history));
    const prompts = localStorage.getItem("obs_saved_prompts");
    if (prompts) setSavedPrompts(JSON.parse(prompts));
  }, [setMounted, setRunHistory, setSavedPrompts]);

  useEffect(() => {
    if (!mounted) return;
    if (!getToken()) router.replace("/login");
  }, [mounted, router]);

  const toggleMic = () => setIsListening(!isListening);

  const handleRun = () => {
    if (!question.trim()) return;
    runAnalysis({ question, time_range: ["now-24h", "now"] });
  };

  const handleLogoClick = () => {
    setCurrentView("copilot");
    useCopilotStore.getState().setResult(null);
    useCopilotStore.getState().setQuestion("");
  };

  const handleExport = () => {
    if (!result) {
      setToast("No analysis result to export.");
      return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(result, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `analysis-${result.run_id.slice(0, 8)}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    setToast("Analysis exported as JSON");
  };

  const handleShare = () => {
    if (!result) {
      setToast("No analysis result to share.");
      return;
    }
    const url = window.location.href + "?run_id=" + result.run_id;
    navigator.clipboard.writeText(url).then(() => {
      setToast("Analysis link copied to clipboard!");
    }).catch(() => {
      setToast("Failed to copy link.");
    });
  };

  const handleSignOut = () => {
    localStorage.clear();
    setToast("Signing out...");
    setTimeout(() => router.replace("/login"), 500);
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      <Toast message={toast} onClose={() => setToast(null)} />

      {/* Background Effects */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl mix-blend-screen opacity-30 animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl mix-blend-screen opacity-30 animate-pulse delay-700" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-[0.03]" />
      </div>

      {/* Navbar */}
      <header className="fixed top-0 w-full bg-slate-900/80 backdrop-blur-md border-b border-slate-800 z-50 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <button
            onClick={handleLogoClick}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <div className="w-10 h-10 flex items-center justify-center">
              <Image src="/logo.png" alt="Logo" width={40} height={40} priority />
            </div>
            <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">Observability Copilot</h1>
          </button>
          <div className="hidden md:flex items-center gap-1">
            <button
              onClick={() => setCurrentView(currentView === "analytics" ? "copilot" : "analytics")}
              className={`p-2 rounded-lg transition-colors ${currentView === "analytics" ? "bg-indigo-500/20 text-indigo-400" : "hover:bg-slate-800 text-slate-400 hover:text-white"}`}
              title="Analytics"
            >
              <BarChart3Icon className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`p-2 rounded-lg transition-colors ${showHistory ? "bg-indigo-500/20 text-indigo-400" : "hover:bg-slate-800 text-slate-400 hover:text-white"}`}
              title="Run History (⌘H)"
              aria-label="Run History"
            >
              <HistoryIcon className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowHelp(!showHelp)}
              className={`p-2 rounded-lg text-sm font-bold transition-colors ${showHelp ? "bg-indigo-500/20 text-indigo-400" : "hover:bg-slate-800 text-slate-400 hover:text-white"}`}
              title="Help & Workflows"
              aria-label="Help"
            >
              ?
            </button>
            <button
              onClick={handleExport}
              className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
              title="Export"
              aria-label="Export"
            >
              <DownloadIcon className="w-5 h-5" />
            </button>
            <button
              onClick={handleShare}
              className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors"
              title="Share"
              aria-label="Share"
            >
              <ShareIcon className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded-lg transition-colors ${showSettings ? "bg-indigo-500/20 text-indigo-400" : "hover:bg-slate-800 text-slate-400 hover:text-white"}`}
              title="Settings"
              aria-label="Settings"
            >
              <CogIcon className="w-5 h-5" />
            </button>
            <button
              onClick={handleSignOut}
              className="ml-2 px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-red-500/10 hover:text-red-400 text-slate-400 rounded-lg transition-colors border border-slate-700 hover:border-red-500/30"
              title="Sign Out"
            >
              Sign Out
            </button>
          </div>
          <button className="md:hidden p-2 text-slate-400" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <XIcon className="w-6 h-6" /> : <MenuIcon className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      {currentView === "analytics" ? (
        <div className="h-screen pt-16">
          <ErrorBoundary label="AnalyticsView">
            <AnalyticsView />
          </ErrorBoundary>
        </div>
      ) : (
        <main className="pt-24 pb-12 px-4 relative z-10 max-w-5xl mx-auto min-h-[calc(100vh-4rem)] flex flex-col items-center">
          <div className="w-full text-center mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight mb-4">
              How can I help debug today?
            </h2>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto">
              AI-powered root cause analysis for your logs, traces, and metrics.
            </p>
          </div>

          <div className="w-full relative flex gap-8 items-start">
            {/* Navigation Sidebar for E2E Flows */}
            <aside className="hidden lg:flex flex-col gap-2 w-48 shrink-0 sticky top-24">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 mb-2">Navigation</h3>
              <button
                onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); }}
                className="flex items-center gap-3 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-xl transition-all group"
              >
                <DashboardIcon className="w-4 h-4 text-slate-500 group-hover:text-indigo-400" />
                Dashboard
              </button>
              <button
                onClick={() => { useCopilotStore.getState().setQuestion("Show me active alerts for the services and identify the top ones."); }}
                className="flex items-center gap-3 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-xl transition-all group"
              >
                <BellIcon className="w-4 h-4 text-slate-500 group-hover:text-red-400" />
                Alerts
              </button>
              <button
                onClick={() => { useCopilotStore.getState().setQuestion("Analyze recent traces to find bottlenecks or spans with errors."); }}
                className="flex items-center gap-3 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-xl transition-all group"
              >
                <ActivityIcon className="w-4 h-4 text-slate-500 group-hover:text-emerald-400" />
                Traces
              </button>
              <button
                onClick={() => { useCopilotStore.getState().setQuestion("Search the latest logs for error patterns or exceptions."); }}
                className="flex items-center gap-3 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-xl transition-all group"
              >
                <DocumentIcon className="w-4 h-4 text-slate-500 group-hover:text-blue-400" />
                Logs
              </button>
              <button
                onClick={() => { useCopilotStore.getState().setQuestion("Open current metrics dashboard to check CPU, Memory and IO."); }}
                className="flex items-center gap-3 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-xl transition-all group"
              >
                <BarChart3Icon className="w-4 h-4 text-slate-500 group-hover:text-amber-400" />
                Metrics
              </button>
            </aside>

            <div className="flex-1 min-w-0 flex flex-col items-center">
              <CommandBar onRun={handleRun} loading={loading} isListening={isListening} toggleMic={toggleMic} />

              <div className="w-full max-w-4xl">
                {result ? (
                  <ErrorBoundary label="ResultsView">
                    <ResultsView />
                  </ErrorBoundary>
                ) : (
                  <ErrorBoundary label="DashboardView">
                    <DashboardView />
                  </ErrorBoundary>
                )}
              </div>
            </div>
          </div>
        </main>
      )}

      {/* History Panel */}
      <HistoryPanel open={showHistory} onClose={() => setShowHistory(false)} />

      {/* Settings Panel */}
      <SettingsPanel open={showSettings} onClose={() => setShowSettings(false)} />

      {/* Help Panel */}
      <HelpPanel
        open={showHelp}
        onClose={() => setShowHelp(false)}
        flows={HELP_FLOWS}
        categories={HELP_CATEGORIES}
        filter={useCopilotStore.getState().helpFilter}
        expandedFlow={useCopilotStore.getState().expandedFlow}
        onFilterChange={useCopilotStore.getState().setHelpFilter}
        onToggleFlow={(id) => {
          const current = useCopilotStore.getState().expandedFlow;
          useCopilotStore.getState().setExpandedFlow(current === id ? null : id);
        }}
      />

      <SavePromptModal
        open={showSaveModal}
        name={promptName}
        onNameChange={setPromptName}
        questionPreview={question}
        onCancel={() => setShowSaveModal(false)}
        onConfirm={() => {
          const newPrompt = {
            id: Math.random().toString(36).substring(7),
            name: promptName,
            question
          };
          setSavedPrompts([...savedPrompts, newPrompt]);
          setShowSaveModal(false);
          setPromptName("");
          setToast("Prompt saved successfully!");
        }}
      />
    </div>
  );
}
