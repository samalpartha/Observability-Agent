"""Ensures agent refuses to propose without citations."""
from agent.validators import (
    block_unsupported_action,
    require_citations,
    require_evidence_count,
    validate_before_propose,
)


def test_require_evidence_count_blocks_low() -> None:
    ok, msg = require_evidence_count([], min_count=2)
    assert ok is False
    assert "2" in msg


def test_require_evidence_count_allows_sufficient() -> None:
    ok, msg = require_evidence_count([1, 2, 3], min_count=2)
    assert ok is True


def test_require_citations_blocks_missing() -> None:
    ok, msg = require_citations([{"statement": "x", "citations": []}])
    assert ok is False


def test_require_citations_allows_present() -> None:
    ok, _ = require_citations([{"statement": "x", "citations": [{"id": "1"}]}])
    assert ok is True


def test_block_unsupported_action() -> None:
    ok, msg = block_unsupported_action("delete")
    assert ok is False
    ok, _ = block_unsupported_action("search_logs")
    assert ok is True


def test_validate_before_propose_refuses_without_citations() -> None:
    findings = [{"message": "a"}]
    claims = [{"statement": "Root cause is X", "citations": []}]
    ok, errors = validate_before_propose(findings, [], claims)
    assert ok is False
    assert any("citation" in e.lower() for e in errors)
