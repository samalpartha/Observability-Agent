"""POST /debug: question, service, env, time_range → run with findings, evidence, remediations."""
import uuid
from dataclasses import asdict
from fastapi import APIRouter, Depends, HTTPException

from agent.planner import PlannerInput, run_planner, record_closure, get_closure_memory
from api.schemas import DebugRequest, DebugResponse
from app.auth import get_current_user
from elastic.links import build_run_kibana_apm_url, build_run_kibana_discover_url

router = APIRouter(prefix="", tags=["debug"])


def _build_evidence_by_type(findings: list) -> dict:
    logs, traces, metrics = [], [], []
    for f in findings:
        if f.get("trace.id"):
            traces.append(f)
        elif f.get("incident_id") or "fix_steps" in str(f):
            continue
        elif "metric" in str(f.get("message", "")).lower() or not f.get("message"):
            metrics.append(f)
        else:
            logs.append(f)
    return {"logs": logs, "traces": traces, "metrics": metrics}


def _build_executive_summary(out) -> list:
    bullets = []
    for i, rc in enumerate(out.root_cause_candidates[:3]):
        bullets.append({"text": rc[:200], "confidence": out.confidence.confidence * (1 - i * 0.1)})
    for r in out.confidence.reasons[:2]:
        bullets.append({"text": r, "confidence": out.confidence.confidence})
    return bullets[:5]


@router.post("/debug", response_model=DebugResponse)
def debug_endpoint(body: DebugRequest, username: str = Depends(get_current_user)) -> DebugResponse:
    # Determine time range label from body
    time_range_label = "1h"
    if body.time_range:
        try:
            from datetime import datetime
            t0 = datetime.fromisoformat(body.time_range[0].replace("Z", "+00:00"))
            t1 = datetime.fromisoformat(body.time_range[1].replace("Z", "+00:00"))
            delta_m = (t1 - t0).total_seconds() / 60
            if delta_m <= 20:
                time_range_label = "15m"
            elif delta_m <= 90:
                time_range_label = "1h"
            elif delta_m <= 400:
                time_range_label = "6h"
            else:
                time_range_label = "24h"
        except Exception:
            pass

    try:
        out = run_planner(
            PlannerInput(
                question=body.question,
                service=body.service,
                env=body.env,
                time_range=body.time_range,
                time_range_label=time_range_label,
            )
        )
    except Exception as e:
        # Planner failure is a 500
        raise HTTPException(status_code=500, detail=f"Analysis engine failed: {str(e)}")

    evidence_by_type = _build_evidence_by_type(out.findings)
    executive_summary = _build_executive_summary(out)
    time_range = out.scope.get("time_range")
    if isinstance(time_range, (list, tuple)) and len(time_range) >= 2:
        tr = (str(time_range[0]), str(time_range[1]))
        kibana_discover_url = build_run_kibana_discover_url(tr, out.scope.get("service"), out.scope.get("env"))
        kibana_apm_url = build_run_kibana_apm_url(tr, out.scope.get("service"), out.scope.get("env"))
    else:
        kibana_discover_url = kibana_apm_url = None
    similar_incidents_serialized = [
        {"incident_id": i.get("incident_id"), "title": i.get("title"), "root_cause": i.get("root_cause"), "fix_steps": i.get("fix_steps"), "score": i.get("score")}
        for i in (out.similar_incidents or [])
    ]

    # Serialize pipeline artifacts
    pipeline_artifacts = {
        "signals_gathered": out.pipeline_artifacts.signals_gathered,
        "signals_total": out.pipeline_artifacts.signals_total,
        "correlation_score": out.pipeline_artifacts.correlation_score,
        "correlated_trace_ids": out.pipeline_artifacts.correlated_trace_ids,
        "gather_complete": out.pipeline_artifacts.gather_complete,
        "correlate_complete": out.pipeline_artifacts.correlate_complete,
        "root_cause_complete": out.pipeline_artifacts.root_cause_complete,
    }

    return DebugResponse(
        run_id=str(uuid.uuid4()),
        status="complete",
        executive_summary=executive_summary,
        findings=out.findings,
        proposed_fixes=out.remediations,
        confidence=out.confidence.confidence,
        confidence_reasons=out.confidence.reasons,
        evidence_links=out.evidence_links,
        root_cause_candidates=out.root_cause_candidates,
        similar_incidents=similar_incidents_serialized,
        scope=out.scope,
        evidence_by_type=evidence_by_type,
        kibana_discover_url=kibana_discover_url,
        kibana_apm_url=kibana_apm_url,
        # New fields
        confidence_tier=out.confidence.tier,
        next_steps=out.confidence.next_steps,
        signal_contributions=out.confidence.signal_contributions,
        attempt_number=out.attempt_number,
        attempt_message=out.attempt_message,
        missing_signals=out.missing_signals,
        pipeline_artifacts=pipeline_artifacts,
        root_cause_states=out.root_cause_states,
        run_delta=out.run_delta,
    )


@router.post("/debug/close")
def close_investigation(
    body: dict,
    username: str = Depends(get_current_user),
) -> dict:
    """Close an investigation and store learnings for future scoring and root cause inference."""
    run_id = body.get("run_id", "")
    root_cause = body.get("root_cause", "")
    signals_used = body.get("signals_used", [])
    false_leads = body.get("false_leads", [])
    resolution_time = body.get("resolution_time_seconds", 0)
    service = body.get("service", "")
    env = body.get("env", "")
    question = body.get("question", "")
    record_closure(run_id, root_cause, signals_used, false_leads, resolution_time,
                   service=service, env=env, question=question)
    return {"status": "ok", "message": "Closure recorded. Future runs will use this learning."}


@router.get("/debug/closures")
def list_closures(username: str = Depends(get_current_user)) -> dict:
    """Return closure memory for display."""
    return {"closures": get_closure_memory()}
