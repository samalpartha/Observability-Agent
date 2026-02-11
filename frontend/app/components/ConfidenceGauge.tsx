"use client";

interface ConfidenceGaugeProps {
  confidence: number;
  tier?: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export function ConfidenceGauge({ confidence, tier, size = "md", showLabel = true }: ConfidenceGaugeProps) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 70 ? "text-cta" : pct >= 40 ? "text-warning" : "text-danger";

  const tierLabel = tier || (pct >= 55 ? "high" : pct >= 25 ? "medium" : "low");

  const sizeClasses = {
    sm: { ring: "w-10 h-10", text: "text-sm", label: "text-[10px]" },
    md: { ring: "w-16 h-16", text: "text-lg", label: "text-caption" },
    lg: { ring: "w-20 h-20", text: "text-2xl", label: "text-body" },
  }[size];

  // SVG circle for gauge
  const radius = size === "sm" ? 16 : size === "md" ? 26 : 34;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - confidence);
  const viewBox = size === "sm" ? 40 : size === "md" ? 64 : 80;
  const center = viewBox / 2;
  const strokeWidth = size === "sm" ? 3 : 4;

  return (
    <div className="flex items-center gap-3" data-testid="confidence-gauge">
      <div className={`relative ${sizeClasses.ring} shrink-0`}>
        <svg viewBox={`0 0 ${viewBox} ${viewBox}`} className="w-full h-full -rotate-90">
          {/* Background circle */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-muted/20"
          />
          {/* Progress arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            className={color}
            style={{ transition: "stroke-dashoffset 0.6s ease-out" }}
          />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center font-bold ${sizeClasses.text} ${color}`}>
          {pct}%
        </span>
      </div>
      {showLabel && (
        <div>
          <p className={`${sizeClasses.label} text-muted`}>Confidence</p>
          <p className={`text-xs font-medium capitalize ${color}`}>{tierLabel}</p>
        </div>
      )}
    </div>
  );
}
