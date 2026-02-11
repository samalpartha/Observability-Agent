"""Dashboard APIs: investigations, service health, recent findings (for Copilot Overview UI)."""
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query

from app.auth import get_current_user

router = APIRouter(prefix="", tags=["dashboard"])

# In-memory sets for mute/dismiss (run_id or investigation id). Reset on server restart.
_muted_ids: set[str] = set()
_dismissed_ids: set[str] = set()


@router.get("/investigations")
def list_investigations(
    service: Optional[str] = Query(None),
    env: Optional[str] = Query(None),
    username: str = Depends(get_current_user),
) -> dict[str, Any]:
    """
    List active investigations. Frontend typically merges with run history (localStorage).
    Returns demo items for UI reference; filter by service/env when provided.
    """
    # Demo investigations matching the reference dashboard (High Error Rate, Memory Leak)
    items = [
        {
            "id": "inv-demo-1",
            "title": "High Error Rate in 'payment service'",
            "trigger": "Triggered by P99 Latency spike (> 2.5s)",
            "severity": "CRITICAL",
            "service": "payment service",
            "status": "ANALYZING_TRACES",
            "progress": 75,
            "description": "I've identified 12 trace outliers in the 'checkout' flow. Correlating these with recent deployment #542...",
            "impact": "5.2% users",
            "muted": "inv-demo-1" in _muted_ids,
            "dismissed": "inv-demo-1" in _dismissed_ids,
        },
        {
            "id": "inv-demo-2",
            "title": "Memory Leak Suspected: 'gateway-api'",
            "trigger": "Heap usage increasing 12% hourly",
            "severity": "WARNING",
            "service": "gateway-api",
            "status": "GATHERING_SIGNALS",
            "progress": 20,
            "description": "Pulling stack dumps and comparing with previous stable version v2.1.0...",
            "impact": "None (Pre-emptive)",
            "muted": "inv-demo-2" in _muted_ids,
            "dismissed": "inv-demo-2" in _dismissed_ids,
        },
    ]
    if service:
        items = [i for i in items if (i.get("service") or "").lower() == service.lower()]
    if env:
        pass  # demo items have no env; keep all
    return {"investigations": [i for i in items if not i.get("dismissed")], "total": len(items)}


@router.post("/investigations/{investigation_id}/mute")
def mute_investigation(
    investigation_id: str,
    username: str = Depends(get_current_user),
) -> dict[str, str]:
    """Mute an investigation (no-op persistence; in-memory for session)."""
    _muted_ids.add(investigation_id)
    return {"status": "ok", "id": investigation_id}


@router.post("/investigations/{investigation_id}/dismiss")
def dismiss_investigation(
    investigation_id: str,
    username: str = Depends(get_current_user),
) -> dict[str, str]:
    """Dismiss an investigation (in-memory; excluded from list)."""
    _dismissed_ids.add(investigation_id)
    return {"status": "ok", "id": investigation_id}


@router.get("/service-health")
def get_service_health(
    username: str = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Service health overview: per-service instance health and aggregated status.
    Returns demo data for Auth-Service and Cart-Engine style cards.
    """
    services = [
        {
            "name": "Auth-Service",
            "instances": 4,
            "instance_health": ["healthy", "healthy", "degraded", "unhealthy"],
            "status": "STABLE",
            "percentage": 99.8,
        },
        {
            "name": "Cart-Engine",
            "instances": 8,
            "instance_health": ["healthy"] * 8,
            "status": "OPTIMAL",
            "percentage": 100.0,
        },
        {
            "name": "payment-service",
            "instances": 6,
            "instance_health": ["healthy", "healthy", "healthy", "healthy", "degraded", "healthy"],
            "status": "STABLE",
            "percentage": 98.2,
        },
    ]
    return {"services": services}


@router.get("/findings/recent")
def get_recent_findings(
    limit: int = Query(10, ge=1, le=50),
    username: str = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Recent findings for the right sidebar: log anomalies, trace outliers, AI insights, deployments.
    """
    findings = [
        {
            "id": "f-1",
            "ago": "5 MIN AGO",
            "title": "Anomaly in 'auth-db' logs",
            "description": "Unexpected spike in 'ConnectionReset' errors detected across 3 nodes in US-EAST-1.",
            "tags": ["LOG-429", "ANOMALY"],
            "type": "log",
        },
        {
            "id": "f-2",
            "ago": "12 MIN AGO",
            "title": "Trace Outlier Detected",
            "description": "/api/v1/checkout call took 4.2s (Normal: 180ms). Service: gateway-api.",
            "tags": ["TRC-881", "LATENCY"],
            "type": "trace",
        },
        {
            "id": "f-3",
            "ago": "24 MIN AGO",
            "title": "AI INSIGHT",
            "description": "I've noticed a 0.98 correlation between 'checkout-db' lock wait times and 'gateway-api' 5xx errors.",
            "tags": ["AI_INSIGHT"],
            "type": "ai_insight",
            "investigate_link": "#",
        },
        {
            "id": "f-4",
            "ago": "45 MIN AGO",
            "title": "New Deployment Verified",
            "description": "Release #882 on 'search-index' confirmed stable after 30 mins observation.",
            "tags": ["STABLE"],
            "type": "deployment",
        },
    ]
    return {"findings": findings[:limit]}


@router.get("/findings/{finding_id}/investigate")
def get_finding_investigate_link(
    finding_id: str,
    username: str = Depends(get_current_user),
) -> dict[str, Any]:
    """Return link to open investigation for this finding (e.g. Kibana or run analysis)."""
    return {"id": finding_id, "url": "#", "message": "Open in Dashboard to analyze"}