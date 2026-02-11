"""
Confidence model: evidence-based scoring. No free base — every point must be earned.

Scoring:
  +0.20 APM error spike (traces confirm errors)
  +0.20 Log error burst (temporal cluster of errors)
  +0.20 Latency anomaly (p95 deviation)
  +0.10 Alert fired (external corroboration)
  +0.15 Closure match (past resolved incident matches current)
  +0.05-0.15 Evidence count bonus (scaled)

Penalties:
  -0.05 per missing source (max -0.20)

Tiers:
  0-25%  → low  → auto-request missing signals
  25-55% → medium → propose next best signal
  55%+   → high → propose action
"""
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class ConfidenceResult:
    confidence: float  # 0 to 1
    reasons: list[str]
    tier: str = "low"  # low | medium | high
    next_steps: list[str] = field(default_factory=list)  # actionable suggestions
    signal_contributions: dict[str, float] = field(default_factory=dict)  # signal → weight


def _classify_tier(score: float) -> str:
    if score >= 0.55:
        return "high"
    if score >= 0.25:
        return "medium"
    return "low"


def _compute_next_steps(
    tier: str,
    sources_available: dict[str, bool],
    has_logs: bool,
    has_traces: bool,
    has_metrics: bool,
    has_incidents: bool,
    time_range_label: str = "15m",
) -> list[str]:
    """Generate actionable next-step suggestions based on confidence tier and missing signals."""
    steps: list[str] = []
    missing = [name for name, avail in sources_available.items() if not avail]

    if tier == "low":
        if "logs" in missing:
            steps.append("Fetch missing logs")
        if "traces" in missing:
            steps.append("Include traces")
        if "metrics" in missing:
            steps.append("Add metrics data")
        if "incidents" in missing:
            steps.append("Search historical incidents")
        if not missing:
            if time_range_label in ("15m", "1h"):
                steps.append("Expand time range to 6h")
            else:
                steps.append("Expand time range to 24h")
            steps.append("Try a broader service scope")
        if not steps:
            steps.append("Broaden time range or scope")
    elif tier == "medium":
        if not has_traces:
            steps.append("Include traces to correlate")
        if not has_metrics:
            steps.append("Add metrics for anomaly detection")
        if not has_incidents:
            steps.append("Check historical incidents")
        if time_range_label in ("15m",):
            steps.append("Expand to 1h for more context")
        if not steps:
            steps.append("Add more service context")
    else:
        steps.append("Review proposed remediations")
        steps.append("Create Kibana case")

    return steps[:3]


def compute_confidence(
    has_trace_log_alignment: bool = False,
    has_metric_anomaly_in_time: bool = False,
    similar_incident_top_score: float = 0.0,
    evidence_count: int = 0,
    min_evidence: int = 2,
) -> ConfidenceResult:
    """
    Rule-based confidence (generic, non-Elastic):
    - Traces confirm logs → +0.25
    - Metric anomaly in time → +0.25
    - Similar incident match → +0.15-0.30
    - Evidence count bonus/penalty
    """
    score = 0.0
    reasons = []
    contributions: dict[str, float] = {}

    if has_trace_log_alignment:
        score += 0.25
        reasons.append("Traces confirm log signals")
        contributions["trace_log_alignment"] = 0.25
    if has_metric_anomaly_in_time:
        score += 0.25
        reasons.append("Metric anomaly aligns in time")
        contributions["metric_anomaly"] = 0.25
    if similar_incident_top_score >= 0.8:
        score += 0.3
        reasons.append("High similarity to past incident")
        contributions["similar_incident"] = 0.3
    elif similar_incident_top_score >= 0.5:
        score += 0.15
        reasons.append("Moderate similarity to past incident")
        contributions["similar_incident"] = 0.15
    if evidence_count >= 5:
        score += 0.2
        reasons.append("Strong evidence count")
        contributions["evidence_count"] = 0.2
    elif evidence_count >= min_evidence:
        score += 0.1
        reasons.append("Sufficient evidence")
        contributions["evidence_count"] = 0.1
    else:
        score -= 0.1
        reasons.append("Low evidence count (penalty)")
        contributions["evidence_count"] = -0.1

    if not reasons:
        reasons.append("No supporting signals found")

    confidence = max(0.0, min(1.0, score))
    tier = _classify_tier(confidence)
    return ConfidenceResult(
        confidence=confidence,
        reasons=reasons,
        tier=tier,
        signal_contributions=contributions,
    )


def compute_confidence_elastic(
    has_apm_errors_spike: bool = False,
    has_logs_error_burst: bool = False,
    has_latency_anomaly: bool = False,
    has_alert_fired: bool = False,
    sources_available: Optional[dict[str, bool]] = None,
    evidence_count: int = 0,
    time_range_label: str = "1h",
    closure_match_score: float = 0.0,
) -> ConfidenceResult:
    """
    Elastic-specific confidence. Every point is earned — no free base.
    Closure match from past resolved incidents biases scoring upward.
    """
    score = 0.0
    reasons: list[str] = []
    contributions: dict[str, float] = {}

    # ── Signal-based scoring ──
    if has_apm_errors_spike:
        score += 0.20
        reasons.append("APM errors spike in same window")
        contributions["apm_errors"] = 0.20

    if has_logs_error_burst:
        score += 0.20
        reasons.append("Logs error burst matches time window")
        contributions["logs_burst"] = 0.20

    if has_latency_anomaly:
        score += 0.20
        reasons.append("Latency p95 increase detected")
        contributions["latency"] = 0.20

    if has_alert_fired:
        score += 0.10
        reasons.append("Alert fired for same service")
        contributions["alert"] = 0.10

    # ── Closure memory bias ──
    if closure_match_score >= 0.7:
        bonus = 0.15
        score += bonus
        reasons.append(f"Strong match to previously resolved incident ({closure_match_score:.0%})")
        contributions["closure_match"] = bonus
    elif closure_match_score >= 0.4:
        bonus = 0.08
        score += bonus
        reasons.append(f"Moderate match to resolved incident ({closure_match_score:.0%})")
        contributions["closure_match"] = bonus

    # ── Evidence count bonus (scaled, not binary) ──
    if evidence_count >= 10:
        bonus = 0.15
        score += bonus
        reasons.append(f"{evidence_count} evidence items (strong)")
        contributions["evidence_count"] = bonus
    elif evidence_count >= 5:
        bonus = 0.10
        score += bonus
        reasons.append(f"{evidence_count} evidence items (good)")
        contributions["evidence_count"] = bonus
    elif evidence_count >= 2:
        bonus = 0.05
        score += bonus
        reasons.append(f"{evidence_count} evidence items (minimal)")
        contributions["evidence_count"] = bonus
    elif evidence_count == 0:
        reasons.append("No evidence found")
        contributions["evidence_count"] = 0.0

    # ── Missing source penalty (capped) ──
    sources = sources_available or {}
    missing_penalty = 0.0
    for name, available in sources.items():
        if not available:
            penalty = 0.05
            missing_penalty += penalty
            reasons.append(f"Missing source: {name}")
            contributions[f"missing_{name}"] = -penalty
    score -= min(missing_penalty, 0.20)  # cap total missing penalty

    if not reasons:
        reasons.append("No signals detected — broaden scope")

    confidence = max(0.0, min(0.95, score))
    tier = _classify_tier(confidence)
    next_steps = _compute_next_steps(
        tier=tier,
        sources_available=sources,
        has_logs=has_logs_error_burst,
        has_traces=has_apm_errors_spike,
        has_metrics=has_latency_anomaly,
        has_incidents=has_alert_fired,
        time_range_label=time_range_label,
    )

    return ConfidenceResult(
        confidence=confidence,
        reasons=reasons,
        tier=tier,
        next_steps=next_steps,
        signal_contributions=contributions,
    )
