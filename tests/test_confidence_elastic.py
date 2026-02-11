"""Tests for the Elastic-specific confidence scoring with zero base and closure memory."""
from agent.confidence import compute_confidence_elastic, ConfidenceResult


class TestElasticConfidence:
    def test_no_signals_gives_zero(self):
        """With no signals, confidence should be 0 — not the old 0.3 base."""
        r = compute_confidence_elastic()
        assert r.confidence == 0.0
        assert r.tier == "low"
        assert len(r.next_steps) > 0

    def test_all_signals_give_high(self):
        r = compute_confidence_elastic(
            has_apm_errors_spike=True,
            has_logs_error_burst=True,
            has_latency_anomaly=True,
            has_alert_fired=True,
            evidence_count=10,
        )
        assert r.confidence >= 0.7
        assert r.tier == "high"
        assert "Review proposed remediations" in r.next_steps

    def test_single_signal(self):
        r = compute_confidence_elastic(has_logs_error_burst=True, evidence_count=3)
        assert r.confidence > 0
        assert r.confidence < 0.5  # single signal shouldn't be high
        assert r.tier in ("low", "medium")

    def test_missing_sources_penalty(self):
        r_full = compute_confidence_elastic(
            has_apm_errors_spike=True,
            has_logs_error_burst=True,
            sources_available={"logs": True, "traces": True, "metrics": True},
            evidence_count=5,
        )
        r_missing = compute_confidence_elastic(
            has_apm_errors_spike=True,
            has_logs_error_burst=True,
            sources_available={"logs": True, "traces": True, "metrics": False, "incidents": False},
            evidence_count=5,
        )
        assert r_missing.confidence < r_full.confidence

    def test_missing_penalty_capped(self):
        """Missing source penalty should be capped at 0.20."""
        r = compute_confidence_elastic(
            has_apm_errors_spike=True,
            has_logs_error_burst=True,
            has_latency_anomaly=True,
            has_alert_fired=True,
            sources_available={"logs": False, "traces": False, "metrics": False, "incidents": False, "extra": False},
            evidence_count=10,
        )
        # Even with 5 missing sources, penalty is max 0.20
        assert r.confidence >= 0.45  # 0.20+0.20+0.20+0.10+0.15 - 0.20 = 0.65

    def test_closure_match_boosts_confidence(self):
        """Closure memory match should boost confidence."""
        r_no_closure = compute_confidence_elastic(
            has_logs_error_burst=True,
            evidence_count=5,
        )
        r_with_closure = compute_confidence_elastic(
            has_logs_error_burst=True,
            evidence_count=5,
            closure_match_score=0.8,
        )
        assert r_with_closure.confidence > r_no_closure.confidence
        assert any("resolved incident" in reason.lower() for reason in r_with_closure.reasons)

    def test_evidence_count_scaling(self):
        """More evidence should give progressively more confidence."""
        r_0 = compute_confidence_elastic(has_logs_error_burst=True, evidence_count=0)
        r_2 = compute_confidence_elastic(has_logs_error_burst=True, evidence_count=2)
        r_5 = compute_confidence_elastic(has_logs_error_burst=True, evidence_count=5)
        r_10 = compute_confidence_elastic(has_logs_error_burst=True, evidence_count=10)
        assert r_2.confidence > r_0.confidence
        assert r_5.confidence > r_2.confidence
        assert r_10.confidence > r_5.confidence

    def test_confidence_capped_at_95(self):
        """Confidence should never exceed 0.95."""
        r = compute_confidence_elastic(
            has_apm_errors_spike=True,
            has_logs_error_burst=True,
            has_latency_anomaly=True,
            has_alert_fired=True,
            evidence_count=20,
            closure_match_score=1.0,
        )
        assert r.confidence <= 0.95

    def test_confidence_never_negative(self):
        r = compute_confidence_elastic(
            sources_available={"logs": False, "traces": False, "metrics": False, "incidents": False},
            evidence_count=0,
        )
        assert r.confidence >= 0.0

    def test_reasons_always_present(self):
        r = compute_confidence_elastic()
        assert len(r.reasons) > 0

    def test_next_steps_for_low_tier(self):
        r = compute_confidence_elastic(
            sources_available={"logs": False, "traces": False},
            evidence_count=0,
        )
        assert r.tier == "low"
        assert any("logs" in s.lower() or "traces" in s.lower() for s in r.next_steps)

    def test_signal_contributions_tracked(self):
        r = compute_confidence_elastic(
            has_apm_errors_spike=True,
            has_logs_error_burst=True,
            evidence_count=5,
        )
        assert "apm_errors" in r.signal_contributions
        assert "logs_burst" in r.signal_contributions
        assert r.signal_contributions["apm_errors"] == 0.20
