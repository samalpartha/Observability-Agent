"use client";

import { SparklesIcon, SearchIcon, TreeIcon, WrenchIcon } from "./Icons";

export function EmptyState() {
  return (
    <div className="card border border-border py-10" data-testid="empty-state">
      <div className="text-center mb-8">
        <SparklesIcon className="w-12 h-12 text-primary mx-auto mb-4 opacity-70" />
        <h2 className="text-lg font-semibold text-foreground mb-2">Ready to investigate</h2>
        <p className="text-body text-muted max-w-lg mx-auto">
          Ask a question about your stack, set scope filters, and click <strong className="text-foreground">Analyze</strong> to begin.
          The AI will search logs, traces, metrics, and past incidents to find the root cause.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
        <div className="text-center p-4 rounded-lg bg-background border border-border">
          <SearchIcon className="w-6 h-6 text-primary mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">Hybrid Search</p>
          <p className="text-xs text-muted mt-1">Lexical + vector search across all sources</p>
        </div>
        <div className="text-center p-4 rounded-lg bg-background border border-border">
          <TreeIcon className="w-6 h-6 text-primary mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">Correlation</p>
          <p className="text-xs text-muted mt-1">Cross-signal analysis with trace linking</p>
        </div>
        <div className="text-center p-4 rounded-lg bg-background border border-border">
          <WrenchIcon className="w-6 h-6 text-primary mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">Remediation</p>
          <p className="text-xs text-muted mt-1">AI-generated fix suggestions with risk levels</p>
        </div>
      </div>
      <div className="mt-6 text-center">
        <p className="text-xs text-muted">Press <kbd className="px-1.5 py-0.5 rounded bg-muted/20 text-foreground font-mono text-[10px]">?</kbd> for help with all user flows</p>
      </div>
    </div>
  );
}
