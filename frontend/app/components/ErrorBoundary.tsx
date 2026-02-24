"use client";
/**
 * ErrorBoundary — catches unhandled React render errors.
 * Wrap any major panel to prevent blank-page crashes.
 *
 * Usage:
 *   <ErrorBoundary label="ResultsView">
 *     <ResultsView />
 *   </ErrorBoundary>
 */
import React from "react";

interface Props {
  children: React.ReactNode;
  label?: string;
  compact?: boolean; // compact=true → small inline error card
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary: ${this.props.label ?? "unknown"}]`, error, info.componentStack);
  }

  handleReset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    const { children, label = "Component", compact = false } = this.props;
    if (!error) return children;

    if (compact) {
      return (
        <div className="rounded-lg border border-red-500/30 bg-red-950/20 p-3 text-xs text-red-400 flex items-center gap-2">
          <span className="shrink-0 text-base">⚠️</span>
          <span>{label} failed to render</span>
          <button
            onClick={this.handleReset}
            className="ml-auto shrink-0 text-xs underline hover:text-red-300"
          >
            retry
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-red-500/20 bg-red-950/10 p-8 text-center">
        <div className="text-4xl">🚨</div>
        <div>
          <p className="text-base font-semibold text-red-400">
            {label} encountered an error
          </p>
          <p className="mt-1 text-sm text-slate-400">
            This component crashed unexpectedly. The rest of the app is still
            running.
          </p>
        </div>
        <details className="w-full max-w-lg text-left">
          <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300">
            Show error details
          </summary>
          <pre className="mt-2 overflow-x-auto rounded bg-black/40 p-3 text-xs text-red-300">
            {error.message}
            {"\n"}
            {error.stack?.split("\n").slice(1, 6).join("\n")}
          </pre>
        </details>
        <button
          onClick={this.handleReset}
          className="rounded-lg bg-red-600/20 px-4 py-2 text-sm text-red-400 hover:bg-red-600/30 border border-red-500/30 transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }
}
