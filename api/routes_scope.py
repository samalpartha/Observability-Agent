"""GET /scope. GET /sources and POST /sources/test are on main app."""
from fastapi import APIRouter, Depends, Query

from app.auth import get_current_user

router = APIRouter(prefix="", tags=["scope"])


@router.get("/scope")
def get_scope(
    username: str = Depends(get_current_user),
    service: str | None = Query(None, description="Filter envs by service.name"),
) -> dict:
    """Services list (always full); envs list filtered by service when provided."""
    try:
        from elastic.client import build_client
        client = build_client()
        services: set[str] = set()
        envs: set[str] = set()
        # Always get full services list (no filter)
        for alias in ["obs-logs-current", "obs-traces-current", "obs-metrics-current"]:
            try:
                r = client.search(
                    index=alias,
                    body={
                        "size": 0,
                        "aggs": {"services": {"terms": {"field": "service.name", "size": 100}}},
                    },
                )
                for b in r.get("aggregations", {}).get("services", {}).get("buckets", []):
                    if b.get("key"):
                        services.add(b["key"])
            except Exception:
                continue
        # Get envs: filtered by service when provided
        must = [{"term": {"service.name": service.strip()}}] if (service and service.strip()) else []
        body: dict = {
            "size": 0,
            "aggs": {
                "envs": {"terms": {"field": "env", "size": 50}},
                "service_env": {"terms": {"field": "service.environment", "size": 50}},
            },
        }
        if must:
            body["query"] = {"bool": {"must": must}}
        for alias in ["obs-logs-current", "obs-traces-current", "obs-metrics-current"]:
            try:
                r = client.search(index=alias, body=body)
                for b in r.get("aggregations", {}).get("envs", {}).get("buckets", []):
                    if b.get("key"):
                        envs.add(b["key"])
                for b in r.get("aggregations", {}).get("service_env", {}).get("buckets", []):
                    if b.get("key"):
                        envs.add(b["key"])
            except Exception:
                continue
        return {"services": sorted(services), "envs": sorted(envs)}
    except Exception as e:
        return {"services": [], "envs": [], "error": str(e)}
