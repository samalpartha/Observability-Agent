"""FastAPI app: load .env, Elastic health check on startup, mount routes."""
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root: find dir that contains .env (walk up from app/)
_app_dir = Path(__file__).resolve().parent
_project_root = _app_dir.parent
_env_file = _project_root / ".env"
# If .env not next to app/, search upward
if not _env_file.exists():
    for parent in _app_dir.parents:
        if (parent / ".env").exists():
            _env_file = parent / ".env"
            _project_root = parent
            break
load_dotenv(_env_file, override=True)

# Ensure auth vars are set (dotenv can miss if CWD differs)
if _env_file.exists():
    try:
        content = _env_file.read_text()
        for line in content.splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                k, v = k.strip(), v.strip().strip("'\"").strip()
                if k in ("DEMO_USER", "DEMO_PASSWORD", "JWT_SECRET_KEY", "ELASTIC_CLOUD_ID", "ELASTIC_API_KEY", "ELASTIC_URL"):
                    os.environ[k] = v
    except Exception:
        pass

from datetime import datetime, timezone

from fastapi import Depends, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from typing import Any, Optional

from app.middleware import (
    RequestTracingMiddleware,
    APIRateLimitMiddleware,
    MetricsCollectorMiddleware,
    get_internal_metrics,
)

from api.routes_auth import router as auth_router
from api.routes_cases import router as cases_router
from api.routes_dashboard import router as dashboard_router
from api.routes_esql import router as esql_router
from api.schemas import ConnectionTestRequest
from api.routes_debug import router as debug_router
from api.routes_ingest import router as ingest_router
from api.routes_metrics import router as metrics_router
from api.routes_scope import router as scope_router
from api.routes_stream import router as stream_router
from api.routes_analytics import router as analytics_router
from api.routes_aiops import router as aiops_router
from app.auth import get_current_user
from elastic.client import build_client, health_check
from elastic.index_bootstrap import bootstrap
from elastic.pipelines import setup_pipeline
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: health check and bootstrap indices + pipeline
    try:
        client = build_client()
        h = health_check(client)
        if not h.get("ok"):
            print(f"Elastic health check warning: {h.get('error')}. App starting in degraded mode.")
        else:
            bootstrap(client)
            setup_pipeline(client)
            # Load persisted closure memory
            from agent.planner import load_closures_from_es
            load_closures_from_es()
    except Exception as e:
        # Log but allow app to start for demo (e.g. no .env in CI)
        print(f"Startup warning: {e}")
    yield
    # Shutdown: close ES client
    from elastic.client import close_client
    close_client()


app = FastAPI(title="Agentic Observability Copilot", lifespan=lifespan)

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": str(exc.detail), "status": "error", "code": exc.status_code},
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    return JSONResponse(
        status_code=422,
        content={"error": "Validation Error", "details": str(exc), "status": "error"},
    )

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    import traceback
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"error": "Internal Server Error", "details": str(exc), "status": "error"},
    )

# CORS: configurable via CORS_ORIGINS env var (comma-separated), with sensible defaults
_cors_origins_env = os.environ.get("CORS_ORIGINS", "").strip()
_cors_origins = (
    [o.strip() for o in _cors_origins_env.split(",") if o.strip()]
    if _cors_origins_env
    else ["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Self-observability middleware stack (order matters: outermost first)
app.add_middleware(MetricsCollectorMiddleware)
app.add_middleware(APIRateLimitMiddleware)
app.add_middleware(RequestTracingMiddleware)

app.include_router(auth_router)
app.include_router(cases_router)
app.include_router(dashboard_router)
app.include_router(esql_router)
app.include_router(scope_router)
app.include_router(debug_router)
app.include_router(ingest_router)
app.include_router(metrics_router)
app.include_router(stream_router)
app.include_router(analytics_router, prefix="/api")
app.include_router(aiops_router, prefix="/api/aiops", tags=["aiops"])


def _check_one_source(client, alias: str) -> tuple[str, str | None]:
    """Returns (status, error). status: connected | degraded | disconnected."""
    try:
        client.count(index=alias)
        return ("connected", None)
    except Exception as e:
        err = str(e)
        if "index_not_found" in err.lower() or "no such index" in err.lower():
            return ("disconnected", err)
        return ("degraded", err)


@app.get("/sources")
def get_sources_route(username: str = Depends(get_current_user)) -> dict:
    """Per-source status: connected | degraded | disconnected, last_check, error. UI: one row per source."""
    now_iso = datetime.now(timezone.utc).isoformat()
    # Elastic Cloud: 5 sources — Logs, Metrics, APM Traces, Alerts, Cases
    sources_list = [
        {"id": "logs", "label": "Logs", "alias": "obs-logs-current"},
        {"id": "metrics", "label": "Metrics", "alias": "obs-metrics-current"},
        {"id": "traces", "label": "APM Traces", "alias": "obs-traces-current"},
        {"id": "alerts", "label": "Alerts", "alias": "obs-incidents-current"},
        {"id": "cases", "label": "Cases", "alias": "obs-incidents-current"},
    ]
    try:
        client = build_client()
        out = []
        for s in sources_list:
            status, err = _check_one_source(client, s["alias"])
            out.append({
                "id": s["id"],
                "label": s["label"],
                "status": status,
                "last_check": now_iso,
                "error": err,
            })
        return {"sources": out}
    except Exception as e:
        return {
            "sources": [
                {"id": s["id"], "label": s["label"], "status": "disconnected", "last_check": None, "error": str(e)}
                for s in sources_list
            ],
        }


@app.get("/connection")
def get_connection(username: str = Depends(get_current_user)) -> dict:
    """Return current connection config (no secrets). For Connect screen to show if configured."""
    try:
        from app.config import ELASTIC_URL, ELASTIC_CLOUD_ID, KIBANA_URL, ELASTIC_SPACE_ID
        return {
            "configured": bool(ELASTIC_URL or ELASTIC_CLOUD_ID),
            "elastic_url": ELASTIC_URL or None,
            "kibana_url": KIBANA_URL or None,
            "space": ELASTIC_SPACE_ID or "default",
        }
    except Exception:
        return {"configured": False, "elastic_url": None, "kibana_url": None, "space": "default"}


@app.post("/connection/test")
def test_connection(
    body: ConnectionTestRequest,
    username: str = Depends(get_current_user),
) -> dict:
    """Test Elastic Cloud connection with provided credentials. Does not store anything."""
    from elasticsearch import Elasticsearch
    url = (body.elastic_url or "").strip().rstrip("/")
    api_key = (body.api_key or "").strip()
    if not url or not api_key:
        return {"ok": False, "error": "Elasticsearch URL and API key are required"}
    try:
        es = Elasticsearch([url], api_key=api_key, request_timeout=15)
        info = es.info()
        return {"ok": True, "cluster_name": info.get("cluster_name", "unknown")}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/sources/test")
def test_sources_route(
    username: str = Depends(get_current_user),
    source: str | None = Query(None, description="Optional: logs|metrics|traces|incidents"),
) -> dict:
    """Test Elastic connection. Optional ?source=logs|metrics|traces|incidents to test one source."""
    alias_map = {"logs": "obs-logs-current", "metrics": "obs-metrics-current", "traces": "obs-traces-current", "alerts": "obs-incidents-current", "cases": "obs-incidents-current"}
    try:
        client = build_client()
        if source and source in alias_map:
            status, err = _check_one_source(client, alias_map[source])
            return {"ok": status == "connected", "source": source, "status": status, "error": err}
        h = health_check(client)
        return {"ok": h.get("ok", False), "cluster_name": h.get("cluster_name"), "error": h.get("error")}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/health")
def health():
    """K8s/load balancer health."""
    try:
        h = health_check()
        return {"status": "ok" if h.get("ok") else "degraded", "elastic": h}
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.get("/internal/metrics")
def internal_metrics(username: str = Depends(get_current_user)) -> dict:
    """Self-observability: request counts, latency percentiles, error rates per endpoint."""
    return {"endpoints": get_internal_metrics()}


@app.get("/internal/circuit-breakers")
def internal_circuit_breakers(username: str = Depends(get_current_user)) -> dict:
    """Self-observability: circuit breaker states."""
    from agent.resilience import _breakers
    return {
        "breakers": {
            name: {"state": cb.state, "failures": cb._failures}
            for name, cb in _breakers.items()
        }
    }


# Dashboard API: /investigations, /service-health, /findings/recent (from api.routes_dashboard)
