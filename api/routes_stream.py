"""SSE streaming endpoint: /debug/stream — real-time pipeline progress."""
import json
import queue
import threading
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from agent.planner import PlannerInput, run_planner
from api.routes_debug import _build_evidence_by_type, _build_executive_summary
from app.auth import get_current_user
from elastic.links import build_run_kibana_apm_url, build_run_kibana_discover_url

router = APIRouter(prefix="", tags=["stream"])

PIPELINE_STAGES = ["scope", "gather", "correlate", "similar", "root_cause", "remediation"]


def _sse_event(event: str, data: Any) -> str:
    payload = json.dumps(data, default=str)
    return f"event: {event}\ndata: {payload}\n\n"


@router.post("/debug/stream")
def debug_stream(
    body: dict,
    username: str = Depends(get_current_user),
):
    """SSE endpoint that streams pipeline stage progress in real time."""
    question = body.get("question", "")
    service_val = body.get("service") or None
    env_val = body.get("env") or None
    time_range = body.get("time_range") or None
    run_id = str(uuid.uuid4())

    # Message queue for SSE events
    msg_queue: queue.Queue = queue.Queue()

    def run_analysis():
        """Run the planner in a background thread, posting progress events."""
        try:
            # Stage 1: Scope
            msg_queue.put(("stage", {"stage": "scope", "index": 0, "status": "running"}))

            time_range_label = "1h"
            if time_range:
                try:
                    from datetime import datetime
                    t0 = datetime.fromisoformat(str(time_range[0]).replace("Z", "+00:00"))
                    t1 = datetime.fromisoformat(str(time_range[1]).replace("Z", "+00:00"))
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

            msg_queue.put(("stage", {"stage": "scope", "index": 0, "status": "complete"}))

            # Run planner (stages 2-6 happen inside)
            msg_queue.put(("stage", {"stage": "gather", "index": 1, "status": "running"}))

            def progress_cb(msg: str):
                msg_queue.put(("progress", {"message": msg}))

            out = run_planner(
                PlannerInput(
                    question=question,
                    service=service_val,
                    env=env_val,
                    time_range=tuple(time_range) if time_range and len(time_range) == 2 else None,
                    time_range_label=time_range_label,
                    progress_callback=progress_cb,
                )
            )

            # Mark remaining stages as complete
            for i, stage in enumerate(PIPELINE_STAGES[1:], 1):
                msg_queue.put(("stage", {"stage": stage, "index": i, "status": "complete"}))

            # Build final response
            evidence_by_type = _build_evidence_by_type(out.findings)
            executive_summary = _build_executive_summary(out)

            tr_scope = out.scope.get("time_range")
            if isinstance(tr_scope, (list, tuple)) and len(tr_scope) >= 2:
                tr = (str(tr_scope[0]), str(tr_scope[1]))
                kib_discover = build_run_kibana_discover_url(tr, out.scope.get("service"), out.scope.get("env"))
                kib_apm = build_run_kibana_apm_url(tr, out.scope.get("service"), out.scope.get("env"))
            else:
                kib_discover = kib_apm = None

            pipeline_artifacts = {
                "signals_gathered": out.pipeline_artifacts.signals_gathered,
                "signals_total": out.pipeline_artifacts.signals_total,
                "correlation_score": out.pipeline_artifacts.correlation_score,
                "gather_complete": out.pipeline_artifacts.gather_complete,
                "correlate_complete": out.pipeline_artifacts.correlate_complete,
                "root_cause_complete": out.pipeline_artifacts.root_cause_complete,
            }

            result = {
                "run_id": run_id,
                "status": "complete",
                "executive_summary": executive_summary,
                "findings": out.findings[:50],  # Cap for SSE payload size
                "proposed_fixes": out.remediations,
                "confidence": out.confidence.confidence,
                "confidence_reasons": out.confidence.reasons,
                "evidence_links": out.evidence_links,
                "root_cause_candidates": out.root_cause_candidates,
                "similar_incidents": [
                    {"incident_id": i.get("incident_id"), "title": i.get("title"),
                     "root_cause": i.get("root_cause"), "fix_steps": i.get("fix_steps"),
                     "score": i.get("score")}
                    for i in (out.similar_incidents or [])
                ],
                "scope": out.scope,
                "evidence_by_type": evidence_by_type,
                "kibana_discover_url": kib_discover,
                "kibana_apm_url": kib_apm,
                "confidence_tier": out.confidence.tier,
                "next_steps": out.confidence.next_steps,
                "signal_contributions": out.confidence.signal_contributions,
                "attempt_number": out.attempt_number,
                "attempt_message": out.attempt_message,
                "missing_signals": out.missing_signals,
                "pipeline_artifacts": pipeline_artifacts,
                "root_cause_states": out.root_cause_states,
                "run_delta": out.run_delta,
            }

            msg_queue.put(("result", result))
        except Exception as e:
            msg_queue.put(("error", {"message": str(e)}))
        finally:
            msg_queue.put(("done", {}))

    def event_generator():
        # Start analysis in background thread
        thread = threading.Thread(target=run_analysis, daemon=True)
        thread.start()

        # Send initial event
        yield _sse_event("start", {"run_id": run_id, "stages": PIPELINE_STAGES})

        while True:
            try:
                event_type, data = msg_queue.get(timeout=60)
                yield _sse_event(event_type, data)
                if event_type in ("done", "error"):
                    break
            except queue.Empty:
                # Send keepalive
                yield ": keepalive\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
