"""GET /metrics/summary — real aggregations from Elasticsearch."""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.auth import get_current_user
from elastic.client import build_client

router = APIRouter(prefix="", tags=["metrics"])


def _safe_agg(client, index: str, body: dict) -> dict:
    """Safely run an ES search; return empty on error."""
    try:
        return client.search(index=index, body=body)
    except Exception:
        return {}


@router.get("/metrics/summary")
def metrics_summary(
    service: Optional[str] = Query(None),
    env: Optional[str] = Query(None),
    time_range: Optional[str] = Query("1h", description="15m|1h|6h|24h"),
    username: str = Depends(get_current_user),
) -> dict:
    """Return p50, p95, p99 latency, throughput, and error rate from real ES data."""
    try:
        client = build_client()
    except Exception:
        return _empty_metrics()

    now = datetime.now(timezone.utc)
    range_map = {"15m": 15, "1h": 60, "6h": 360, "24h": 1440}
    minutes = range_map.get(time_range or "1h", 60)
    from_time = datetime.fromtimestamp(now.timestamp() - minutes * 60, tz=timezone.utc).isoformat()

    # Build must filters
    must = [{"range": {"@timestamp": {"gte": from_time, "lte": now.isoformat()}}}]
    if service:
        must.append({"term": {"service.name": service}})
    if env:
        must.append({"term": {"service.environment": env}})

    # 1. Latency percentiles from traces
    latency = _get_latency(client, must)

    # 2. Throughput (events per minute) from logs
    throughput = _get_throughput(client, must, minutes)

    # 3. Error rate from logs
    error_rate = _get_error_rate(client, must)

    # 4. Total events
    total_events = _get_total_events(client, must)

    return {
        "latency_p50_ms": latency.get("p50"),
        "latency_p95_ms": latency.get("p95"),
        "latency_p99_ms": latency.get("p99"),
        "throughput_per_min": throughput,
        "error_rate_pct": error_rate,
        "total_events": total_events,
        "time_range": time_range,
        "service": service,
        "env": env,
    }


def _get_latency(client, must: list) -> dict:
    """Get p50, p95, p99 from trace duration field."""
    body = {
        "size": 0,
        "query": {"bool": {"must": must}},
        "aggs": {
            "latency_percentiles": {
                "percentiles": {
                    "field": "transaction.duration.us",
                    "percents": [50, 95, 99],
                }
            }
        },
    }
    res = _safe_agg(client, "obs-traces-current", body)
    values = res.get("aggregations", {}).get("latency_percentiles", {}).get("values", {})
    return {
        "p50": round(values.get("50.0", 0) / 1000, 1) if values.get("50.0") else None,
        "p95": round(values.get("95.0", 0) / 1000, 1) if values.get("95.0") else None,
        "p99": round(values.get("99.0", 0) / 1000, 1) if values.get("99.0") else None,
    }


def _get_throughput(client, must: list, minutes: int) -> float | None:
    """Events per minute from logs index."""
    body = {
        "size": 0,
        "query": {"bool": {"must": must}},
    }
    res = _safe_agg(client, "obs-logs-current", body)
    total = res.get("hits", {}).get("total", {})
    count = total.get("value", 0) if isinstance(total, dict) else total
    if not count or minutes <= 0:
        return None
    return round(count / minutes, 1)


def _get_error_rate(client, must: list) -> float | None:
    """Percentage of error-level logs."""
    # Total logs
    total_body = {"size": 0, "query": {"bool": {"must": must}}}
    total_res = _safe_agg(client, "obs-logs-current", total_body)
    total_hits = total_res.get("hits", {}).get("total", {})
    total_count = total_hits.get("value", 0) if isinstance(total_hits, dict) else total_hits

    if not total_count:
        return None

    # Error logs
    error_must = must + [{"terms": {"log.level": ["error", "ERROR", "fatal", "FATAL", "critical", "CRITICAL"]}}]
    error_body = {"size": 0, "query": {"bool": {"must": error_must}}}
    error_res = _safe_agg(client, "obs-logs-current", error_body)
    error_hits = error_res.get("hits", {}).get("total", {})
    error_count = error_hits.get("value", 0) if isinstance(error_hits, dict) else error_hits

    return round((error_count / total_count) * 100, 2)


def _get_total_events(client, must: list) -> int:
    """Total events across logs, traces, metrics."""
    total = 0
    for index in ["obs-logs-current", "obs-traces-current", "obs-metrics-current"]:
        body = {"size": 0, "query": {"bool": {"must": must}}}
        res = _safe_agg(client, index, body)
        hits = res.get("hits", {}).get("total", {})
        count = hits.get("value", 0) if isinstance(hits, dict) else hits
        total += count
    return total


def _empty_metrics() -> dict:
    return {
        "latency_p50_ms": None,
        "latency_p95_ms": None,
        "latency_p99_ms": None,
        "throughput_per_min": None,
        "error_rate_pct": None,
        "total_events": 0,
        "time_range": None,
        "service": None,
        "env": None,
    }
