"""Ensures Kibana/APM links build correctly."""
from retrieval.evidence import (
    EvidenceLink,
    apm_trace_link,
    discover_link,
    metrics_dashboard_link,
)
from retrieval.hybrid_query import HybridResult


def test_discover_link_has_url() -> None:
    hit = HybridResult("obs-logs-current", "id1", 0.1, 0.2, 0.3, "msg", "2024-01-01T00:00:00Z", "svc", "trace-1", "span-1", None)
    link = discover_link(hit, time_range=("2024-01-01T00:00:00Z", "2024-01-01T01:00:00Z"))
    assert link.kind == "discover"
    assert link.label == "Kibana Discover"
    assert "discover" in link.url
    assert "obs-logs" in link.url or "index" in link.url.lower()


def test_apm_trace_link_has_trace_id() -> None:
    link = apm_trace_link("trace-abc-123", service_name="checkout-service")
    assert link.kind == "apm_trace"
    assert "trace-abc-123" in link.url or "traces" in link.url


def test_metrics_dashboard_link() -> None:
    link = metrics_dashboard_link(service_name="checkout")
    assert link.kind == "metrics_dashboard"
    assert "metrics" in link.url.lower()
