"use client";

interface LoadingSkeletonProps {
  steps: string[];
  activeStep: number;
  statusMessage?: string | null;
}

export function LoadingSkeleton({ steps, activeStep, statusMessage }: LoadingSkeletonProps) {
  return (
    <div className="space-y-6" data-testid="loading-skeleton">
      {/* Pipeline progress */}
      <div className="card border border-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-body text-foreground font-medium animate-pulse">
            {statusMessage || "Analyzing your stack..."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {steps.map((label, idx) => (
            <span
              key={label}
              className={`px-3 py-1.5 rounded-lg text-caption transition-all duration-500 ${idx <= activeStep
                  ? "bg-primary/20 text-primary font-medium"
                  : "bg-muted/10 text-muted"
                }`}
            >
              {idx < activeStep ? "✓ " : idx === activeStep ? "● " : ""}{label}
            </span>
          ))}
        </div>
      </div>
      {/* Skeleton: Executive Summary */}
      <div className="card border border-border animate-pulse">
        <div className="h-5 w-48 bg-muted/20 rounded mb-4" />
        <div className="space-y-3">
          <div className="h-4 w-full bg-muted/15 rounded" />
          <div className="h-4 w-5/6 bg-muted/15 rounded" />
          <div className="h-4 w-3/4 bg-muted/15 rounded" />
        </div>
      </div>
      {/* Skeleton: Evidence cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
        {[1, 2].map((i) => (
          <div key={i} className="card border border-border">
            <div className="h-4 w-32 bg-muted/20 rounded mb-3" />
            <div className="space-y-2">
              <div className="h-3 w-full bg-muted/10 rounded" />
              <div className="h-3 w-4/5 bg-muted/10 rounded" />
              <div className="h-3 w-3/5 bg-muted/10 rounded" />
            </div>
          </div>
        ))}
      </div>
      {/* Skeleton: Confidence bar */}
      <div className="card border border-border animate-pulse">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-muted/20" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 bg-muted/20 rounded" />
            <div className="h-2 w-full bg-muted/10 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
