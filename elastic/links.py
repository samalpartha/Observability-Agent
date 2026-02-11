"""
Build run-level Kibana Discover and APM links for the UI (Open in Kibana, Open APM).
Uses time range, service, env from scope. Server-side only.
"""
from typing import Optional
from urllib.parse import urlencode


def _base_and_space() -> tuple[str, str]:
    try:
        from app.config import KIBANA_URL, ELASTIC_SPACE_ID
        base = (KIBANA_URL or "").rstrip("/") or ""
        space = (ELASTIC_SPACE_ID or "").strip() or ""
        return base, space
    except Exception:
        return "", ""


def build_run_kibana_discover_url(
    time_range: tuple[str, str],
    service: Optional[str] = None,
    env: Optional[str] = None,
) -> Optional[str]:
    """
    Kibana Discover URL with time range and optional KQL filter.
    Filter: service.name:"{service}" and service.environment:"{env}"
    """
    base, space = _base_and_space()
    if not base:
        return None
    path = "/app/discover"
    if space:
        path = f"/s/{space}/app/discover"
    # Time filter for URL _g
    g = f"(time:(from:'{time_range[0]}',to:'{time_range[1]}'))"
    params: dict[str, str] = {"_g": g}
    # KQL query if scope present (language:kuery, query:'...')
    kql_parts = []
    if service:
        kql_parts.append(f'service.name: "{service}"')
    if env:
        kql_parts.append(f'service.environment: "{env}"')
    if kql_parts:
        kql = " and ".join(kql_parts)
        params["_a"] = f"(query:(language:kuery,query:'{kql}'))"
    q = urlencode(params)
    return f"{base}{path}#/?{q}"


def build_run_kibana_apm_url(
    time_range: tuple[str, str],
    service: Optional[str] = None,
    env: Optional[str] = None,
) -> Optional[str]:
    """
    Kibana APM services/overview URL with time range, service, environment.
    """
    base, space = _base_and_space()
    if not base:
        return None
    path = "/app/apm"
    if space:
        path = f"/s/{space}/app/apm"
    g = f"(time:(from:'{time_range[0]}',to:'{time_range[1]}'))"
    params: dict[str, str] = {"_g": g}
    if service:
        params["serviceName"] = service
    if env:
        params["environment"] = env
    q = urlencode(params)
    return f"{base}{path}#/?{q}"
