
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
import { MenuIcon, XIcon, CogIcon, HistoryIcon, BarChart3Icon } from "./components/Icons";

type UserFlow = {
  id: string;
  title: string;
  category: "core" | "scope" | "results" | "history" | "nav" | "admin";
  steps: string[];
  shortcut?: string;
};

const HELP_FLOWS: UserFlow[] = [
  { id: "1", title: "Run Analysis", category: "core", steps: ["Type a query", "Press Enter", "View results"], shortcut: "Enter" },
  { id: "2", title: "Voice Input", category: "core", steps: ["Click Mic icon", "Speak query", "Click Mic to stop"], shortcut: "Space" },
  { id: "3", title: "View History", category: "history", steps: ["Click History icon", "Select run", "View past result"], shortcut: "⌘H" }
];

const HELP_CATEGORIES: { key: UserFlow["category"]; label: string }[] = [
  { key: "core", label: "Core" },
  { key: "history", label: "History" }
];

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
    setRunHistory, setSavedPrompts,
    toast, setToast,
    currentView, setCurrentView
  } = useCopilotStore();

  const [promptName, setPromptName] = useState("");
  const { runAnalysis } = useAnalysis();

  // Initial load
  useEffect(() => {
    setMounted(true);
    // Load history from local storage
    const history = localStorage.getItem("observability_copilot_run_history");
    if (history) setRunHistory(JSON.parse(history));
    const prompts = localStorage.getItem("observability_copilot_saved_prompts");
    if (prompts) setSavedPrompts(JSON.parse(prompts));
  }, [setMounted, setRunHistory, setSavedPrompts]);

  // Auth check
  useEffect(() => {
    if (!mounted) return;
    if (!getToken()) router.replace("/login");
  }, [mounted, router]);

  const toggleMic = () => {
    // Basic mic toggle simulation for now, logic moved to hook if complex
    setIsListening(!isListening);
  };

  const handleRun = () => {
    if (!question.trim()) return;
    runAnalysis({ question, time_range: ["now-1h", "now"] });
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      <Toast message={toast} onClose={() => setToast(null)} />

      {/* Background Effects */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl mix-blend-screen opacity-30 animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl mix-blend-screen opacity-30 animate-pulse delay-700"></div>
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-[0.03]"></div>
      </div>

      {/* Navbar */}
      <header className="fixed top-0 w-full bg-slate-900/80 backdrop-blur-md border-b border-slate-800 z-50 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center">
              <Image src="/logo.png" alt="Logo" width={40} height={40} priority />
            </div>
            <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">Observability Copilot</h1>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <button
              onClick={() => setCurrentView("analytics")}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
              title="Analytics"
            >
              <BarChart3Icon className="w-5 h-5" />
            </button>
            <button onClick={() => setShowHistory(!showHistory)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
              <HistoryIcon className="w-5 h-5" />
            </button>
            <button onClick={() => setShowHelp(!showHelp)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
              <span className="font-bold">?</span>
            </button>
            <button className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
              <CogIcon className="w-5 h-5" />
            </button>
          </div>
          <button
            className="md:hidden p-2 text-slate-400"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <XIcon className="w-6 h-6" /> : <MenuIcon className="w-6 h-6" />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      {currentView === "analytics" ? (
        <div className="h-screen pt-16">
          <AnalyticsView />
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

          <CommandBar
            onRun={handleRun}
            loading={loading}
            isListening={isListening}
            toggleMic={toggleMic}
          />



          <div className="w-full">
            {result ? (
              <ResultsView />
            ) : (
              <DashboardView />
            )}
          </div>

        </main>
      )}

      {/* Overlays */}
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
          // Implementation for saving prompt would go here
          console.log("Saving prompt:", promptName);
          setShowSaveModal(false);
          setPromptName("");
        }}
      />
    </div>
  );
}
