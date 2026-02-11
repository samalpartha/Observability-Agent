"""
Smoke test for ObsAgentBench: run one scenario and assert the runner and grader work.
Does not require Elasticsearch to be populated; may pass or fail depending on data.
"""
import json
import sys
from pathlib import Path

import pytest

# Project root
ROOT = Path(__file__).resolve().parent.parent
SCENARIOS_DIR = ROOT / "benchmarks" / "scenarios"


@pytest.fixture(scope="module")
def scenario():
    """Load the first available scenario."""
    if not SCENARIOS_DIR.is_dir():
        pytest.skip("benchmarks/scenarios not found")
    for p in sorted(SCENARIOS_DIR.glob("*.json")):
        with open(p) as f:
            return json.load(f)
    pytest.skip("no scenario JSON files found")


@pytest.fixture(scope="module")
def run_planner():
    """Import run_planner from agent (add root to path if needed)."""
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    from agent.planner import PlannerInput, run_planner
    return run_planner, PlannerInput


def test_grader_grade_pass():
    """Grade a result that meets expectations."""
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    from benchmarks.grader import grade
    scenario = {
        "expected_root_cause_keywords": ["evidence", "insufficient"],
        "expected_evidence_min_count": 0,
        "required_remediation_min_count": 1,
        "min_confidence": 0.0,
    }
    result = {
        "root_cause_candidates": ["Insufficient evidence – gather more signals"],
        "executive_summary": [{"text": "Insufficient evidence"}],
        "findings": [],
        "proposed_fixes": [{"action": "Review recent changes", "risk_level": "medium"}],
        "confidence": 0.35,
    }
    passed, details = grade(scenario, result)
    assert passed is True
    assert details["passed"] is True


def test_grader_grade_fail_keywords():
    """Grade fails when root cause keyword is missing."""
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    from benchmarks.grader import grade
    scenario = {"expected_root_cause_keywords": ["nonexistent_keyword_xyz"]}
    result = {
        "root_cause_candidates": ["Insufficient evidence"],
        "executive_summary": [],
        "findings": [],
        "proposed_fixes": [],
        "confidence": 0.3,
    }
    passed, details = grade(scenario, result)
    assert passed is False
    assert details["checks"]["root_cause_keywords"]["passed"] is False


def test_run_one_scenario(scenario, run_planner):
    """Run a single scenario through the planner and grade (smoke test)."""
    run_planner_fn, PlannerInput = run_planner
    from benchmarks.grader import get_time_range, grade

    time_preset = scenario.get("time_preset") or "1h"
    tr = get_time_range(time_preset)
    inp = PlannerInput(
        question=scenario.get("question", "Why is checkout slow?"),
        service=scenario.get("service") or None,
        env=scenario.get("env") or None,
        time_range=tr,
    )
    try:
        out = run_planner_fn(inp)
    except Exception as e:
        pytest.skip(f"planner failed (e.g. no Elasticsearch): {e}")

    from benchmarks.run_benchmark import _planner_output_to_result
    result = _planner_output_to_result(out)
    if not result.get("executive_summary") and result.get("root_cause_candidates"):
        result["executive_summary"] = [{"text": c} for c in result["root_cause_candidates"][:5]]

    passed, details = grade(scenario, result)
    assert "checks" in details
    assert isinstance(passed, bool)
