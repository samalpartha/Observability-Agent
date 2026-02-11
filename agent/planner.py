"""
Deterministic workflow: scope → gather signals → correlate → similar incidents → root cause candidates → remediations.

Production features:
- Attempt tracking: evolving messages across runs
- Pipeline gating: each step outputs verifiable artifacts, blocks next step if incomplete
- Evidence-based confidence: every score point is earned, closure memory biases scoring
- Root cause state progression: Observed → Correlated → Probable → Confirmed
- Active closure memory: past resolved incidents improve future root cause and confidence
"""
import hashlib
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Optional

from agent.confidence import ConfidenceResult, compute_confidence_elastic
from agent.resilience import logger, sanitize_user_input
from agent.tools import (
    tool_find_changes,
    tool_find_similar_incidents,
    tool_propose_fix,
    tool_search_logs,
    tool_search_metrics,
    tool_search_traces,
)
from agent.validators import validate_before_propose


# ── Attempt tracker per scope fingerprint ──
_attempt_history: dict[str, list[dict]] = defaultdict(list)

# ── Closure memory — stores resolved incident learnings ──
_closure_memory: list[dict] = []


def _scope_fingerprint(question: str, service: Optional[str], env: Optional[str]) -> str:
    key = f"{question.strip().lower()}|{(service or '').lower()}|{(env or '').lower()}"
    return hashlib.sha256(key.encode()).hexdigest()[:16]


@dataclass
class PipelineArtifacts:
    """FIX #4: Each pipeline step outputs machine-verifiable artifacts."""
    signals_gathered: dict[str, int] = field(default_factory=dict)  # source → count
    signals_total: int = 0
    correlation_score: float = 0.0
    correlated_trace_ids: list[str] = field(default_factory=list)
    hypothesis_list: list[dict] = field(default_factory=list)  # [{text, weight, state}]
    gather_complete: bool = False
    correlate_complete: bool = False
    root_cause_complete: bool = False


@dataclass
class PlannerInput:
    question: str
    service: Optional[str] = None
    env: Optional[str] = None
    time_range: Optional[tuple[str, str]] = None
    # FIX #3: attempt context
    attempt_number: int = 1
    previous_missing: list[str] = field(default_factory=list)
    # FIX #9: action context
    action: Optional[str] = None  # "investigate" | "widen_time" | "add_traces" | "dismiss" | None
    previous_run_id: Optional[str] = None
    time_range_label: str = "1h"
    # Phase 2: Streaming
    from typing import Callable, Optional
    progress_callback: Optional[Callable[[str], None]] = None


@dataclass
class PlannerOutput:
    scope: dict[str, Any]
    findings: list[dict]
    similar_incidents: list[dict]
    root_cause_candidates: list[str]
    remediations: list[dict]  # [{action, risk_level}, ...]
    confidence: ConfidenceResult
    evidence_links: list[dict]
    # FIX #3: attempt state
    attempt_number: int = 1
    attempt_message: str = ""
    missing_signals: list[str] = field(default_factory=list)
    # FIX #4: pipeline artifacts
    pipeline_artifacts: PipelineArtifacts = field(default_factory=PipelineArtifacts)
    # FIX #8: root cause states
    root_cause_states: list[dict] = field(default_factory=list)  # [{text, state}]
    # FIX #6: run deltas (for semantic difference in history)
    run_delta: dict[str, Any] = field(default_factory=dict)


def _default_time_range() -> tuple[str, str]:
    from datetime import datetime, timedelta
    end = datetime.utcnow()
    start = end - timedelta(hours=1)
    return start.strftime("%Y-%m-%dT%H:%M:%SZ"), end.strftime("%Y-%m-%dT%H:%M:%SZ")


def record_closure(run_id: str, root_cause: str, signals_used: list[str],
                   false_leads: list[str], resolution_time_seconds: float,
                   service: str = "", env: str = "", question: str = "") -> None:
    """Store closure learnings in memory AND persist to Elasticsearch."""
    from datetime import datetime, timezone
    doc = {
        "run_id": run_id,
        "root_cause": root_cause,
        "signals_used": signals_used,
        "false_leads": false_leads,
        "resolution_time_seconds": resolution_time_seconds,
        "service": service,
        "env": env,
        "question_keywords": list(_extract_keywords(question)),
        "timestamp": time.time(),
        "@timestamp": datetime.now(timezone.utc).isoformat(),
    }
    _closure_memory.append({**doc, "question_keywords": _extract_keywords(question)})
    # Keep last 100 in memory
    if len(_closure_memory) > 100:
        _closure_memory.pop(0)
    # Persist to ES
    try:
        from elastic.client import build_client
        client = build_client()
        client.index(index="obs-closures-current", body=doc)
        logger.info(f"Closure persisted to ES: run_id={run_id}")
    except Exception as e:
        logger.warning(f"Failed to persist closure to ES: {e}")
    logger.info(f"Closure recorded: run_id={run_id}, root_cause={root_cause[:80]}")


def load_closures_from_es() -> None:
    """Load closure memory from Elasticsearch on startup."""
    global _closure_memory
    try:
        from elastic.client import build_client
        client = build_client()
        res = client.search(
            index="obs-closures-current",
            body={"size": 100, "sort": [{"@timestamp": {"order": "desc"}}]},
        )
        hits = res.get("hits", {}).get("hits", [])
        loaded = []
        for hit in hits:
            src = hit.get("_source", {})
            kw = src.get("question_keywords", [])
            src["question_keywords"] = set(kw) if isinstance(kw, list) else kw
            loaded.append(src)
        if loaded:
            _closure_memory.clear()
            _closure_memory.extend(loaded)
            logger.info(f"Loaded {len(loaded)} closures from Elasticsearch")
    except Exception as e:
        logger.debug(f"Could not load closures from ES (may not exist yet): {e}")


def get_closure_memory() -> list[dict]:
    """Return closure memory for display."""
    return [{**c, "question_keywords": list(c["question_keywords"]) if isinstance(c.get("question_keywords"), set) else c.get("question_keywords", [])} for c in _closure_memory]


def _extract_keywords(text: str) -> set[str]:
    """Extract meaningful keywords from text for matching."""
    stop_words = {"the", "a", "an", "is", "are", "was", "were", "in", "on", "at", "to", "for",
                  "of", "with", "by", "from", "what", "why", "how", "when", "where", "which"}
    words = set(w.lower().strip("?.,!;:") for w in text.split() if len(w) > 2)
    return words - stop_words


def _match_closures(question: str, service: Optional[str], findings: list[dict]) -> tuple[float, Optional[dict]]:
    """
    Match current investigation against past closures.
    Returns (match_score 0-1, best_matching_closure or None).
    Uses keyword overlap + service match + signal pattern match.
    """
    if not _closure_memory:
        return 0.0, None

    question_kw = _extract_keywords(question)
    finding_messages = " ".join((f.get("message") or "")[:100] for f in findings[:10]).lower()

    best_score = 0.0
    best_closure = None

    for closure in _closure_memory:
        score = 0.0

        # Keyword overlap (max 0.4)
        closure_kw = closure.get("question_keywords", set())
        if question_kw and closure_kw:
            overlap = len(question_kw & closure_kw) / max(len(question_kw | closure_kw), 1)
            score += overlap * 0.4

        # Service match (0.2)
        if service and closure.get("service") and service.lower() == closure["service"].lower():
            score += 0.2

        # Root cause appears in current findings (0.3)
        root_cause = (closure.get("root_cause") or "").lower()
        if root_cause and any(kw in finding_messages for kw in root_cause.split()[:5] if len(kw) > 3):
            score += 0.3

        # Signals used pattern match (0.1)
        past_signals = set(closure.get("signals_used", []))
        current_signals = set()
        for f in findings:
            if f.get("trace.id"):
                current_signals.add("traces")
            if f.get("message"):
                current_signals.add("logs")
        if past_signals and current_signals and past_signals & current_signals:
            score += 0.1

        if score > best_score:
            best_score = score
            best_closure = closure

    return min(best_score, 1.0), best_closure


def _classify_root_cause_state(
    candidate: str,
    findings_count: int,
    correlation_score: float,
    similar_match: bool,
    confidence: float,
) -> str:
    """FIX #8: Promote root cause candidates through states."""
    if confidence >= 0.7 and similar_match and correlation_score > 0.5:
        return "confirmed"
    if correlation_score > 0.3 and findings_count >= 3:
        return "probable"
    if findings_count >= 1:
        return "correlated"
    return "observed"


def run_planner(inputs: PlannerInput) -> PlannerOutput:
    """
    1. Confirm scope (service, env, time range)
    5. Propose top 3 root cause candidates — with state
    6. Propose top 3 remediations with risk level — gated by root cause state
    """
    from typing import Callable
    progress_callback: Optional[Callable[[str], None]] = getattr(inputs, "progress_callback", None)

    time_range = inputs.time_range or _default_time_range()
    scope = {
        "question": inputs.question,
        "service": inputs.service,
        "env": inputs.env,
        "time_range": time_range,
    }
    filters = {"time_range": time_range, "service": inputs.service, "env": inputs.env, "top_k": 20}
    artifacts = PipelineArtifacts()
    fp = _scope_fingerprint(inputs.question, inputs.service, inputs.env)

    # Require Elasticsearch to be configured before calling tools
    if progress_callback:
        progress_callback("Checking Elasticsearch connection...")
    try:
        from elastic.client import build_client
        build_client()
    except Exception as e:
        msg = str(e).strip() or "Elasticsearch is not configured. Set ELASTIC_URL and ELASTIC_API_KEY in the backend .env file."
        return PlannerOutput(
            scope=scope,
            findings=[],
            similar_incidents=[],
            root_cause_candidates=[msg],
            remediations=[{"action": "Configure ELASTIC_URL and ELASTIC_API_KEY in the backend .env, then restart the server.", "risk_level": "low"}],
            confidence=ConfidenceResult(confidence=0.0, reasons=[msg]),
            evidence_links=[],
            attempt_number=inputs.attempt_number,
            attempt_message=msg,
            missing_signals=["logs", "metrics", "traces", "incidents"],
        )

    # ══════ STEP 2: Gather signals (gated) ══════
    if progress_callback:
        progress_callback("Gathering signals from Logs, Traces, and Metrics...")

    log_res = tool_search_logs(inputs.question, filters)
    if progress_callback:
        progress_callback(f"Found {len(log_res.evidence)} relevant log entries.")

    trace_res = tool_search_traces(inputs.question, filters)
    if progress_callback:
        progress_callback(f"Found {len(trace_res.evidence)} traces matching criteria.")

    metrics_res = tool_search_metrics(inputs.question, filters)
    if progress_callback:
        progress_callback(f"Analyzed metrics: found {len(metrics_res.evidence)} anomalies.")

    changes_res = tool_find_changes(time_range, inputs.service)
    if progress_callback:
        progress_callback(f"Checked for recent deployments: found {len(changes_res.evidence)}.")

    findings = []
    for r in [log_res, trace_res, metrics_res]:
        findings.extend(r.evidence)
    findings.extend(changes_res.evidence)

    # FIX #4: Record signal artifacts
    artifacts.signals_gathered = {
        "logs": len(log_res.evidence),
        "traces": len(trace_res.evidence),
        "metrics": len(metrics_res.evidence),
        "changes": len(changes_res.evidence),
    }
    artifacts.signals_total = len(findings)
    artifacts.gather_complete = True  # step 2 always completes

    # FIX #3: Track missing signals for this attempt
    missing_signals = []
    if len(log_res.evidence) == 0:
        missing_signals.append("logs")
    if len(trace_res.evidence) == 0:
        missing_signals.append("traces")
    if len(metrics_res.evidence) == 0:
        missing_signals.append("metrics")

    # ══════ STEP 3: Correlate (gated: requires signals) ══════
    if progress_callback:
        progress_callback("Correlating events across signals...")
        trace_ids = {f.get("trace.id") for f in findings if f.get("trace.id")}
    if trace_ids:
        scope["correlated_trace_ids"] = list(trace_ids)
        artifacts.correlated_trace_ids = list(trace_ids)

    # FIX #4: Correlation score = ratio of cross-source matches
    source_types_with_data = sum(1 for c in artifacts.signals_gathered.values() if c > 0)
    artifacts.correlation_score = min(1.0, source_types_with_data / 3.0)
    artifacts.correlate_complete = source_types_with_data >= 1

    # ══════ STEP 4: Similar incidents ══════
    if progress_callback:
        progress_callback("Searching for similar resolved incidents...")
    inc_res = tool_find_similar_incidents(inputs.question, {"service": inputs.service, "env": inputs.env, "top_k": 5})
    similar_incidents = inc_res.evidence
    if similar_incidents:
        artifacts.correlation_score = min(1.0, artifacts.correlation_score + 0.2)
        if progress_callback:
            progress_callback(f"Found {len(similar_incidents)} similar past incidents.")

    if len(similar_incidents) == 0:
        missing_signals.append("incidents")

    # ══════ STEP 5: Root cause candidates (gated by correlation) ══════
    root_cause_candidates = []

    # FIX #4: Only run LLM root cause if correlate step is complete
    if artifacts.correlate_complete:
        if progress_callback:
            progress_callback("Analyzing findings with LLM to identify root cause...")
        findings_text = "\n".join((f.get("message") or str(f))[:200] for f in findings[:20])
        incidents_text = "\n".join(
            f"Incident: {i.get('root_cause')}; fix: {i.get('fix_steps')}" for i in similar_incidents[:5]
        )
        try:
            from agent.llm import llm_root_cause_summary
            summary = llm_root_cause_summary(inputs.question, findings_text, incidents_text)
            if summary:
                root_cause_candidates.append(summary.strip())
        except Exception:
            pass
        for inc in similar_incidents[:3]:
            if inc.get("root_cause") and inc["root_cause"] not in str(root_cause_candidates):
                root_cause_candidates.append(inc["root_cause"][:200])
        if not root_cause_candidates and changes_res.evidence:
            root_cause_candidates.append("Recent deployment or config change")

    if not root_cause_candidates:
        root_cause_candidates.append("Insufficient evidence – gather more signals")

    artifacts.root_cause_complete = len(root_cause_candidates) > 0 and root_cause_candidates[0] != "Insufficient evidence – gather more signals"

    # FIX #8: Classify root cause states
    root_cause_states = []
    for rc in root_cause_candidates:
        state = _classify_root_cause_state(
            candidate=rc,
            findings_count=len(findings),
            correlation_score=artifacts.correlation_score,
            similar_match=bool(similar_incidents),
            confidence=0.0,  # will be updated after confidence calc
        )
        root_cause_states.append({"text": rc, "state": state})
    artifacts.hypothesis_list = root_cause_states

    # ══════ STEP 6: Remediations (gated by root cause state) ══════
    
    # ══════ STEP 6: Remediations (gated by root cause state) ══════
    # FIX #8: Only propose remediations if at least one candidate is 'probable' or 'confirmed'
    best_state = "observed"
    for s in root_cause_states:
        if s["state"] == "confirmed":
            best_state = "confirmed"
            break
        if s["state"] == "probable" and best_state != "confirmed":
            best_state = "probable"
        if s["state"] == "correlated" and best_state not in ("probable", "confirmed"):
            best_state = "correlated"

    if best_state in ("probable", "confirmed"):
        claims = [{"statement": rc, "citations": findings[:2]} for rc in root_cause_candidates]
        ok, validation_errors = validate_before_propose(findings, similar_incidents, claims)
        if ok:
            fix_res = tool_propose_fix(findings, similar_incidents)
            remediations = [{"action": e.get("proposed_action", ""), "risk_level": e.get("risk_level", "medium")} for e in fix_res.evidence[:3]]
        else:
            remediations = [{"action": "Gather more evidence before applying fix", "risk_level": "low"}]
    elif best_state == "correlated":
        remediations = [{"action": "Gather more evidence to confirm hypothesis", "risk_level": "low"}]
    else:
        remediations = [{"action": "Broaden scope or add missing signal sources", "risk_level": "low"}]

    # ══════ Closure memory matching ══════
    closure_match_score, matched_closure = _match_closures(inputs.question, inputs.service, findings)
    if matched_closure and closure_match_score >= 0.4:
        # Inject past root cause as a candidate if not already present
        past_rc = matched_closure.get("root_cause", "")
        # Check if past_rc is already in root_cause_candidates
        is_present = False
        for candidate in root_cause_candidates:
             if past_rc in candidate:
                 is_present = True
                 break
        if past_rc and not is_present:
            root_cause_candidates.append(f"[Past resolution] {past_rc[:200]}")
            logger.info(f"Closure memory injected root cause: {past_rc[:60]} (score={closure_match_score:.2f})")

    # ══════ Confidence ══════
    has_log_burst = len(log_res.evidence) > 0
    has_apm_errors = len(trace_res.evidence) > 0
    has_latency = len(metrics_res.evidence) > 0
    has_alert = bool(similar_incidents)
    sources_available = {
        "logs": has_log_burst,
        "metrics": has_latency,
        "traces": has_apm_errors,
        "incidents": has_alert,
    }
    confidence = compute_confidence_elastic(
        has_apm_errors_spike=has_apm_errors,
        has_logs_error_burst=has_log_burst,
        has_latency_anomaly=has_latency,
        has_alert_fired=has_alert,
        sources_available=sources_available,
        evidence_count=len(findings),
        time_range_label=inputs.time_range_label,
        closure_match_score=closure_match_score,
    )

    # FIX #8: Re-classify root cause states now that confidence is known
    for rcs in root_cause_states:
        rcs["state"] = _classify_root_cause_state(
            candidate=rcs["text"],
            findings_count=len(findings),
            correlation_score=artifacts.correlation_score,
            similar_match=bool(similar_incidents),
            confidence=confidence.confidence,
        )

    evidence_links = []
    for f in findings[:15]:
        evidence_links.extend(f.get("links") or [])

    # ══════ FIX #3: Build attempt message ══════
    prev_attempts = _attempt_history.get(fp, [])
    attempt_number = len(prev_attempts) + 1

    if attempt_number == 1:
        if missing_signals:
            attempt_message = f"First analysis. Missing: {', '.join(missing_signals)}."
        else:
            attempt_message = "First analysis. All signal sources responding."
    else:
        prev = prev_attempts[-1]
        prev_missing = set(prev.get("missing", []))
        now_missing = set(missing_signals)
        gained = prev_missing - now_missing
        still_missing = now_missing
        parts = []
        if gained:
            parts.append(f"Gained: {', '.join(gained)}")
        if still_missing:
            parts.append(f"Still missing: {', '.join(still_missing)}")
        prev_confidence = prev.get("confidence", 0)
        conf_delta = confidence.confidence - prev_confidence
        if abs(conf_delta) > 0.01:
            parts.append(f"Confidence {'↑' if conf_delta > 0 else '↓'} {abs(conf_delta)*100:.0f}%")
        if attempt_number >= 3 and now_missing and confidence.confidence < 0.3:
            attempt_message = f"Attempt {attempt_number}. {'. '.join(parts)}. Auto-widening scope recommended."
        else:
            attempt_message = f"Attempt {attempt_number}. {'. '.join(parts)}." if parts else f"Attempt {attempt_number}."

    # Record this attempt
    _attempt_history[fp].append({
        "attempt": attempt_number,
        "confidence": confidence.confidence,
        "missing": missing_signals,
        "signals": artifacts.signals_gathered,
        "timestamp": time.time(),
    })

    # FIX #6: Compute run delta (semantic difference from previous run)
    prev_run = prev_attempts[-1] if prev_attempts else {}
    run_delta: dict[str, Any] = {}
    
    if prev_run:
        prev_signals = prev_run.get("signals", {})
        prev_total = sum(prev_signals.values()) if isinstance(prev_signals, dict) else 0
        
        run_delta = {
            "signals_added": artifacts.signals_total - prev_total,
            "confidence_delta": confidence.confidence - prev_run.get("confidence", 0),
            "missing_resolved": list(set(prev_run.get("missing", [])) - set(missing_signals)),
            "root_cause_changed": bool(root_cause_candidates and root_cause_candidates[0] != "Insufficient evidence – gather more signals"),
        }

    return PlannerOutput(
        scope=scope,
        findings=findings,
        similar_incidents=similar_incidents,
        root_cause_candidates=root_cause_candidates,
        remediations=remediations,
        confidence=confidence,
        evidence_links=evidence_links,
        attempt_number=attempt_number,
        attempt_message=attempt_message,
        missing_signals=missing_signals,
        pipeline_artifacts=artifacts,
        root_cause_states=root_cause_states,
        run_delta=run_delta,
    )
