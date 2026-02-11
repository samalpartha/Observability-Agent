"""
Grading logic for ObsAgentBench scenarios.
Compares agent output against scenario expectations (root cause keywords, evidence count, remediation count, confidence).
"""
from typing import Any


def get_time_range(time_preset: str) -> tuple[str, str]:
    """Return (start_iso, end_iso) for the given preset."""
    from datetime import datetime, timezone
    end = datetime.now(timezone.utc)
    start = datetime.now(timezone.utc)
    if time_preset == "15m":
        start = start.replace(minute=start.minute - 15) if start.minute >= 15 else start.replace(hour=start.hour - 1, minute=start.minute + 60 - 15)
    elif time_preset == "1h":
        start = start.replace(hour=start.hour - 1)
    elif time_preset == "6h":
        start = start.replace(hour=start.hour - 6)
    elif time_preset == "24h":
        start = start.replace(day=start.day - 1)
    else:
        start = start.replace(hour=start.hour - 1)
    return start.isoformat(), end.isoformat()


def grade(
    scenario: dict[str, Any],
    result: dict[str, Any],
) -> tuple[bool, dict[str, Any]]:
    """
    Grade a single run result against the scenario.
    Returns (passed: bool, details: dict with per-criterion pass/fail and messages).
    """
    details: dict[str, Any] = {"checks": {}, "passed": True}

    # Root cause keywords: at least one must appear in any root_cause_candidate or executive_summary text
    expected_kw = scenario.get("expected_root_cause_keywords") or []
    if expected_kw:
        candidates = result.get("root_cause_candidates") or []
        summary_texts = [b.get("text", "") for b in (result.get("executive_summary") or []) if isinstance(b, dict)]
        all_text = " ".join(candidates + summary_texts).lower()
        found = any(kw.lower() in all_text for kw in expected_kw)
        details["checks"]["root_cause_keywords"] = {"passed": found, "expected_any_of": expected_kw}
        if not found:
            details["passed"] = False
    else:
        details["checks"]["root_cause_keywords"] = {"passed": True, "skipped": True}

    # Evidence (findings) minimum count
    min_evidence = scenario.get("expected_evidence_min_count")
    if min_evidence is not None:
        count = len(result.get("findings") or [])
        passed = count >= min_evidence
        details["checks"]["evidence_min_count"] = {"passed": passed, "expected_min": min_evidence, "actual": count}
        if not passed:
            details["passed"] = False
    else:
        details["checks"]["evidence_min_count"] = {"passed": True, "skipped": True}

    # Remediation minimum count
    min_remediation = scenario.get("required_remediation_min_count")
    if min_remediation is not None:
        count = len(result.get("proposed_fixes") or [])
        passed = count >= min_remediation
        details["checks"]["remediation_min_count"] = {"passed": passed, "expected_min": min_remediation, "actual": count}
        if not passed:
            details["passed"] = False
    else:
        details["checks"]["remediation_min_count"] = {"passed": True, "skipped": True}

    # Minimum confidence
    min_conf = scenario.get("min_confidence")
    if min_conf is not None:
        conf = float(result.get("confidence") or 0)
        passed = conf >= min_conf
        details["checks"]["min_confidence"] = {"passed": passed, "expected_min": min_conf, "actual": conf}
        if not passed:
            details["passed"] = False
    else:
        details["checks"]["min_confidence"] = {"passed": True, "skipped": True}

    return details["passed"], details
