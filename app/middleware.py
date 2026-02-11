"""
Production middleware: request tracing, structured logging, API rate limiting, response timing.
Self-observability — the observability tool observes itself.
"""
import time
import uuid
from collections import defaultdict
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from agent.resilience import logger


# ── Request tracing + timing ──

class RequestTracingMiddleware(BaseHTTPMiddleware):
    """Add X-Request-ID, X-Response-Time headers. Log every request with timing."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())[:12]
        start = time.perf_counter()

        # Attach request_id to request state for downstream use
        request.state.request_id = request_id

        try:
            response = await call_next(request)
        except Exception as e:
            elapsed = (time.perf_counter() - start) * 1000
            logger.error(
                f"[{request_id}] {request.method} {request.url.path} FAILED "
                f"in {elapsed:.1f}ms: {type(e).__name__}: {e}"
            )
            raise

        elapsed = (time.perf_counter() - start) * 1000
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time"] = f"{elapsed:.1f}ms"

        # Log based on status code
        status = response.status_code
        level = "INFO" if status < 400 else "WARNING" if status < 500 else "ERROR"
        log_fn = getattr(logger, level.lower(), logger.info)
        log_fn(
            f"[{request_id}] {request.method} {request.url.path} "
            f"→ {status} in {elapsed:.1f}ms"
        )

        return response


# ── API rate limiting ──

_api_rate_limits: dict[str, list[float]] = defaultdict(list)
_API_RATE_WINDOW = 60  # 1 minute window
_API_RATE_LIMITS: dict[str, int] = {
    "/debug": 10,          # 10 analyses per minute per IP
    "/debug/stream": 10,
    "/debug/close": 20,
    "/cases": 5,           # 5 case creations per minute
    "/connection/test": 10,
    "/sources/test": 20,
}


class APIRateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limit expensive endpoints per client IP."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path
        method = request.method

        # Only rate-limit POST/PUT endpoints that are expensive
        if method not in ("POST", "PUT"):
            return await call_next(request)

        limit = _API_RATE_LIMITS.get(path)
        if not limit:
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        key = f"{client_ip}:{path}"
        now = time.time()

        # Clean old entries
        _api_rate_limits[key] = [t for t in _api_rate_limits[key] if now - t < _API_RATE_WINDOW]

        if len(_api_rate_limits[key]) >= limit:
            logger.warning(f"API rate limit hit: {key} ({len(_api_rate_limits[key])}/{limit})")
            return Response(
                content='{"detail":"Rate limit exceeded. Please wait before retrying."}',
                status_code=429,
                media_type="application/json",
                headers={"Retry-After": str(_API_RATE_WINDOW)},
            )

        _api_rate_limits[key].append(now)
        return await call_next(request)


# ── Prometheus-style metrics collector ──

_request_counts: dict[str, int] = defaultdict(int)
_request_durations: dict[str, list[float]] = defaultdict(list)
_error_counts: dict[str, int] = defaultdict(int)
_MAX_DURATION_SAMPLES = 1000


class MetricsCollectorMiddleware(BaseHTTPMiddleware):
    """Collect request metrics for the /internal/metrics endpoint."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path
        method = request.method
        key = f"{method} {path}"
        start = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception:
            _error_counts[key] += 1
            _request_counts[key] += 1
            raise

        elapsed_ms = (time.perf_counter() - start) * 1000
        _request_counts[key] += 1
        durations = _request_durations[key]
        durations.append(elapsed_ms)
        if len(durations) > _MAX_DURATION_SAMPLES:
            _request_durations[key] = durations[-_MAX_DURATION_SAMPLES:]

        if response.status_code >= 500:
            _error_counts[key] += 1

        return response


def get_internal_metrics() -> dict:
    """Return collected metrics for the /internal/metrics endpoint."""
    metrics = {}
    for key in sorted(_request_counts.keys()):
        durations = _request_durations.get(key, [])
        sorted_d = sorted(durations) if durations else []
        p50 = sorted_d[len(sorted_d) // 2] if sorted_d else 0
        p95 = sorted_d[int(len(sorted_d) * 0.95)] if sorted_d else 0
        p99 = sorted_d[int(len(sorted_d) * 0.99)] if sorted_d else 0
        metrics[key] = {
            "total_requests": _request_counts[key],
            "error_count": _error_counts.get(key, 0),
            "latency_p50_ms": round(p50, 1),
            "latency_p95_ms": round(p95, 1),
            "latency_p99_ms": round(p99, 1),
            "samples": len(durations),
        }
    return metrics
