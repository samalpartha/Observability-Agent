"""
Block unsupported actions; require at least N evidence items before proposing a fix; require citations for every claim.
"""
from typing import Any

# Minimum evidence items before proposing a fix
MIN_EVIDENCE_FOR_FIX = 2

# Blocked action types (example)
BLOCKED_ACTIONS = {"delete", "drop_index", "run_shell"}


def require_evidence_count(evidence: list[Any], min_count: int = MIN_EVIDENCE_FOR_FIX) -> tuple[bool, str]:
    """
    Require at least min_count evidence items before proposing a fix.
    Returns (ok, reason).
    """
    if len(evidence) < min_count:
        return False, f"At least {min_count} evidence items required; got {len(evidence)}."
    return True, ""


def require_citations(claims: list[dict[str, Any]]) -> tuple[bool, str]:
    """
    Require every claim to have citations (evidence references).
    claims: list of {"statement": ..., "citations": [...]}
    Returns (ok, reason).
    """
    for i, c in enumerate(claims):
        cites = c.get("citations") or c.get("evidence_refs") or []
        if not cites:
            return False, f"Claim {i+1} has no citations."
    return True, ""


def block_unsupported_action(action: str) -> tuple[bool, str]:
    """Block unsupported actions. Returns (allowed, reason)."""
    if action in BLOCKED_ACTIONS:
        return False, f"Action '{action}' is not allowed."
    return True, ""


def validate_before_propose(findings: list[Any], incidents: list[Any], claims: list[dict]) -> tuple[bool, list[str]]:
    """
    Run all validations before proposing a fix.
    Returns (ok, list of failure reasons).
    """
    errors = []
    ok, msg = require_evidence_count(findings + incidents)
    if not ok:
        errors.append(msg)
    ok, msg = require_citations(claims)
    if not ok:
        errors.append(msg)
    return len(errors) == 0, errors
