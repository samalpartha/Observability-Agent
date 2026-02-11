"""
Build clickable Kibana/APM links for each finding so the UI can show proof.
"""
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlencode

from retrieval.hybrid_query import HybridResult


@dataclass
class EvidenceLink:
    kind: str  # "discover" | "apm_trace" | "metrics_dashboard"
    label: str
    url: str


def _kibana_base(kibana_base_url: Optional[str] = None) -> str:
    if kibana_base_url:
        return kibana_base_url.rstrip("/")
    try:
        from app.config import KIBANA_URL
        if KIBANA_URL:
            return KIBANA_URL.rstrip("/")
    except Exception:
        pass
    return "https://my-elasticsearch-project-c5ba52.kb.us-central1.gcp.elastic.cloud"


def discover_link(
    hit: HybridResult,
    time_range: Optional[tuple[str, str]] = None,
    kibana_base_url: Optional[str] = None,
) -> EvidenceLink:
    """Build Kibana Discover link for a log hit."""
    base = _kibana_base(kibana_base_url)
    params = {
        "index": hit.index,
        "_g": "(time:(from:now-1h,to:now))",
    }
    if hit.timestamp:
        params["_g"] = f"(time:(from:'{hit.timestamp}',to:'{hit.timestamp}'))"
    if time_range:
        params["_g"] = f"(time:(from:'{time_range[0]}',to:'{time_range[1]}'))"
    q = urlencode(params)
    url = f"{base}/app/discover#/?{q}"
    return EvidenceLink(kind="discover", label="Kibana Discover", url=url)


def apm_trace_link(
    trace_id: str,
    service_name: Optional[str] = None,
    kibana_base_url: Optional[str] = None,
) -> EvidenceLink:
    """Build APM trace link for a trace hit."""
    base = _kibana_base(kibana_base_url)
    path = f"/app/apm/traces/{trace_id}"
    if service_name:
        path += f"?serviceName={service_name}"
    url = f"{base}{path}"
    return EvidenceLink(kind="apm_trace", label="APM Trace", url=url)


def metrics_dashboard_link(
    service_name: Optional[str] = None,
    time_range: Optional[tuple[str, str]] = None,
    kibana_base_url: Optional[str] = None,
) -> EvidenceLink:
    """Build Metrics dashboard link for a metric hit."""
    base = _kibana_base(kibana_base_url)
    params = {}
    if time_range:
        params["_g"] = f"(time:(from:'{time_range[0]}',to:'{time_range[1]}'))"
    q = urlencode(params) if params else ""
    url = f"{base}/app/metrics" + ("#" + q if q else "")
    return EvidenceLink(kind="metrics_dashboard", label="Metrics Dashboard", url=url)


def evidence_links_for_hit(
    hit: HybridResult,
    time_range: Optional[tuple[str, str]] = None,
    kibana_base_url: Optional[str] = None,
) -> list[EvidenceLink]:
    """Return all applicable links for a hybrid result (Discover + APM if trace_id)."""
    links = [discover_link(hit, time_range=time_range, kibana_base_url=kibana_base_url)]
    if hit.trace_id:
        links.append(
            apm_trace_link(
                hit.trace_id,
                service_name=hit.service_name,
                kibana_base_url=kibana_base_url,
            )
        )
    return links
