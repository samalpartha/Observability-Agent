"""Ensures confidence drops when evidence is missing."""
from agent.confidence import ConfidenceResult, compute_confidence


def test_confidence_high_with_alignment_and_evidence() -> None:
    r = compute_confidence(
        has_trace_log_alignment=True,
        has_metric_anomaly_in_time=True,
        similar_incident_top_score=0.85,
        evidence_count=6,
    )
    assert r.confidence >= 0.7
    assert "Traces confirm" in " ".join(r.reasons) or "Strong evidence" in " ".join(r.reasons)


def test_confidence_drops_when_evidence_low() -> None:
    r_low = compute_confidence(evidence_count=0, min_evidence=2)
    r_high = compute_confidence(evidence_count=5, min_evidence=2)
    assert r_low.confidence < r_high.confidence
    assert any("evidence" in x.lower() for x in r_low.reasons)


def test_confidence_bounded_0_1() -> None:
    r = compute_confidence(
        has_trace_log_alignment=True,
        has_metric_anomaly_in_time=True,
        similar_incident_top_score=1.0,
        evidence_count=10,
    )
    assert 0 <= r.confidence <= 1
