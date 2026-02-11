"use client";

import { HelpIcon, XIcon, ChevronRightIcon } from "./Icons";

type UserFlow = {
  id: string;
  title: string;
  category: "core" | "scope" | "results" | "history" | "nav" | "admin";
  steps: string[];
  shortcut?: string;
};

interface HelpPanelProps {
  open: boolean;
  flows: UserFlow[];
  categories: { key: UserFlow["category"]; label: string }[];
  filter: string;
  expandedFlow: string | null;
  onClose: () => void;
  onFilterChange: (filter: string) => void;
  onToggleFlow: (flowId: string) => void;
}

export function HelpPanel({ open, flows, categories, filter, expandedFlow, onClose, onFilterChange, onToggleFlow }: HelpPanelProps) {
  if (!open) return null;

  const filteredFlows = filter === "all" ? flows : flows.filter((f) => f.category === filter);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" data-testid="help-panel-overlay">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-surface border-l border-border shadow-2xl flex flex-col overflow-hidden animate-slide-in" data-testid="help-panel" role="dialog" aria-label="Help — User Flows">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-background/80">
          <div className="flex items-center gap-2">
            <HelpIcon className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold text-foreground font-display">User Flows</h2>
            <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-bold">{flows.length}</span>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-foreground p-1 rounded cursor-pointer" aria-label="Close help" data-testid="help-close">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Category filter */}
        <div className="flex gap-1 px-4 py-2 border-b border-border overflow-x-auto" data-testid="help-category-filters">
          <button
            type="button"
            onClick={() => onFilterChange("all")}
            className={`px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors ${filter === "all" ? "bg-primary text-white" : "text-muted hover:bg-primary/10"}`}
          >All ({flows.length})</button>
          {categories.map((cat) => {
            const count = flows.filter((f) => f.category === cat.key).length;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => onFilterChange(cat.key)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors ${filter === cat.key ? "bg-primary text-white" : "text-muted hover:bg-primary/10"}`}
                data-testid={`help-cat-${cat.key}`}
              >{cat.label} ({count})</button>
            );
          })}
        </div>

        {/* Flows list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1" data-testid="help-flows-list">
          {filteredFlows.map((flow) => (
            <div key={flow.id} className="rounded-lg border border-border bg-background/60 overflow-hidden" data-testid={`help-flow-${flow.id}`}>
              <button
                type="button"
                onClick={() => onToggleFlow(flow.id)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-left cursor-pointer hover:bg-primary/5 transition-colors"
                data-testid={`help-flow-toggle-${flow.id}`}
                aria-expanded={expandedFlow === flow.id}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    flow.category === "core" ? "bg-primary" :
                    flow.category === "scope" ? "bg-cta" :
                    flow.category === "results" ? "bg-warning" :
                    flow.category === "history" ? "bg-purple-400" :
                    flow.category === "nav" ? "bg-cyan-400" : "bg-muted"
                  }`} />
                  <span className="text-xs font-medium text-foreground truncate">{flow.title}</span>
                  {flow.shortcut && (
                    <kbd className="hidden sm:inline text-[9px] px-1.5 py-0.5 rounded bg-muted/20 text-muted font-mono border border-border">{flow.shortcut}</kbd>
                  )}
                </div>
                <ChevronRightIcon className={`w-3.5 h-3.5 text-muted shrink-0 transition-transform ${expandedFlow === flow.id ? "rotate-90" : ""}`} />
              </button>
              {expandedFlow === flow.id && (
                <div className="px-3 pb-3 pt-0" data-testid={`help-flow-steps-${flow.id}`}>
                  <ol className="space-y-1.5 ml-3">
                    {flow.steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-2 text-[11px] text-muted">
                        <span className="w-4 h-4 rounded-full bg-primary/10 text-primary text-[9px] flex items-center justify-center shrink-0 mt-0.5 font-bold">{i + 1}</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border bg-background/80 text-center">
          <p className="text-[10px] text-muted">Press <kbd className="px-1 py-0.5 rounded bg-muted/20 border border-border font-mono text-[9px]">?</kbd> anytime to toggle this panel</p>
        </div>
      </div>
    </div>
  );
}
