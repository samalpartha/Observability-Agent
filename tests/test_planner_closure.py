"""Tests for closure memory matching and learning in the planner."""
from agent.planner import (
    _closure_memory,
    _extract_keywords,
    _match_closures,
    record_closure,
    get_closure_memory,
)


class TestClosureMemory:
    def setup_method(self):
        """Clear closure memory before each test."""
        _closure_memory.clear()

    def test_record_closure_stores(self):
        record_closure(
            run_id="test-001",
            root_cause="Database connection pool exhausted",
            signals_used=["logs", "traces"],
            false_leads=["network timeout"],
            resolution_time_seconds=300.0,
            service="payment-service",
            env="prod",
            question="Why is payment service failing?",
        )
        closures = get_closure_memory()
        assert len(closures) == 1
        assert closures[0]["root_cause"] == "Database connection pool exhausted"
        assert closures[0]["service"] == "payment-service"
        assert "question_keywords" in closures[0]

    def test_closure_memory_limit(self):
        for i in range(110):
            record_closure(
                run_id=f"test-{i:03d}",
                root_cause=f"Cause {i}",
                signals_used=["logs"],
                false_leads=[],
                resolution_time_seconds=60.0,
            )
        assert len(get_closure_memory()) == 100

    def test_keyword_extraction(self):
        keywords = _extract_keywords("Why is the checkout service latency spiking in production?")
        assert "checkout" in keywords
        assert "service" in keywords
        assert "latency" in keywords
        assert "spiking" in keywords
        assert "production" in keywords
        # Stop words removed
        assert "is" not in keywords
        assert "the" not in keywords
        assert "why" not in keywords

    def test_closure_match_no_memory(self):
        score, match = _match_closures("some question", "service", [])
        assert score == 0.0
        assert match is None

    def test_closure_match_service_match(self):
        record_closure(
            run_id="rc-001",
            root_cause="Memory leak in payment handler",
            signals_used=["logs"],
            false_leads=[],
            resolution_time_seconds=120.0,
            service="payment-service",
            question="Payment service OOM crash",
        )
        score, match = _match_closures(
            "Payment service memory issues",
            "payment-service",
            [{"message": "OutOfMemoryError in payment handler"}],
        )
        assert score > 0.3  # Service match + keyword overlap + root cause in findings
        assert match is not None
        assert match["service"] == "payment-service"

    def test_closure_match_keyword_overlap(self):
        record_closure(
            run_id="rc-002",
            root_cause="Redis connection timeout",
            signals_used=["logs", "traces"],
            false_leads=[],
            resolution_time_seconds=60.0,
            question="Redis timeout causing latency spike",
        )
        score, _ = _match_closures(
            "Redis connection timeout in checkout",
            None,
            [],
        )
        assert score > 0  # Keyword overlap should contribute

    def test_closure_match_root_cause_in_findings(self):
        record_closure(
            run_id="rc-003",
            root_cause="Kafka consumer lag causing delayed processing",
            signals_used=["metrics"],
            false_leads=[],
            resolution_time_seconds=180.0,
            question="Order processing delays",
        )
        score, match = _match_closures(
            "Processing delays in orders",
            None,
            [{"message": "Kafka consumer lag detected: 50000 messages behind"}],
        )
        assert score > 0.2  # Root cause "kafka" appears in findings
