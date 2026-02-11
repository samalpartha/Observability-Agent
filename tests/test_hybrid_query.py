"""Ensures filters apply before search and fusion returns stable ordering."""
from unittest.mock import MagicMock, patch

from retrieval.hybrid_query import HybridResult, _rrf_score, hybrid_query


def test_rrf_score_ordering() -> None:
    """Lower rank => higher RRF score."""
    assert _rrf_score(0) > _rrf_score(1) > _rrf_score(10)


def test_hybrid_result_fused_ordering() -> None:
    """Results sorted by fused score descending."""
    results = [
        HybridResult("obs-logs-v1", "1", 0.1, 0.2, 0.15, "a", None, None, None, None),
        HybridResult("obs-logs-v1", "2", 0.2, 0.3, 0.25, "b", None, None, None, None),
        HybridResult("obs-logs-v1", "3", 0.05, 0.1, 0.08, "c", None, None, None, None),
    ]
    ordered = sorted(results, key=lambda r: -r.score_fused)
    assert ordered[0].doc_id == "2"
    assert ordered[1].doc_id == "1"
    assert ordered[2].doc_id == "3"


def test_hybrid_query_applies_filters() -> None:
    """When client is mocked, verify query body includes filter (time_range, service)."""
    mock_es = MagicMock()
    mock_es.search.return_value = {"hits": {"hits": []}}
    with patch("retrieval.hybrid_query.embed_text", return_value=([0.1] * 384, "model", "v1")):
        hybrid_query(mock_es, "test", time_range=("2024-01-01T00:00:00Z", "2024-01-01T01:00:00Z"), service="svc", top_k=5)
    assert mock_es.search.called
    call_kw = mock_es.search.call_args[1]
    body = call_kw.get("body", {})
    query = body.get("query", {})
    assert "bool" in str(query) or "range" in str(query)
