#!/usr/bin/env python3
"""
ObsAgentBench runner: load scenarios, run the planner for each, grade, and report.
Usage:
  python -m benchmarks.run_benchmark                    # run all scenarios
  python -m benchmarks.run_benchmark --scenarios dir   # custom scenarios dir
  python -m benchmarks.run_benchmark --list            # list scenarios only
"""
import argparse
import json
import sys
from pathlib import Path

# Project root = parent of benchmarks/
BENCH_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = BENCH_ROOT.parent
DEFAULT_SCENARIOS_DIR = BENCH_ROOT / "scenarios"


def _load_scenarios(scenarios_dir: Path) -> list[dict]:
    """Load all .json scenario files from the given directory."""
    scenarios = []
    for p in sorted(scenarios_dir.glob("*.json")):
        try:
            with open(p, "r") as f:
                data = json.load(f)
            data["_path"] = str(p)
            scenarios.append(data)
        except Exception as e:
            print(f"Warning: skip {p}: {e}", file=sys.stderr)
    return scenarios


def _planner_output_to_result(out) -> dict:
    """Convert PlannerOutput (or dict-like) to result dict for grading."""
    candidates = getattr(out, "root_cause_candidates", None) or (out.get("root_cause_candidates") if isinstance(out, dict) else [])
    summary = getattr(out, "executive_summary", None) or (out.get("executive_summary") if isinstance(out, dict) else [])
    if not summary and candidates:
        summary = [{"text": c} for c in candidates[:5]]
    conf_val = getattr(out, "confidence", None)
    if conf_val is not None and hasattr(conf_val, "confidence"):
        conf_val = conf_val.confidence
    elif isinstance(out, dict):
        conf_val = out.get("confidence", 0)
    else:
        conf_val = 0
    return {
        "root_cause_candidates": candidates,
        "executive_summary": summary,
        "findings": getattr(out, "findings", None) or (out.get("findings") if isinstance(out, dict) else []),
        "proposed_fixes": getattr(out, "remediations", None) or (out.get("proposed_fixes") or out.get("remediations") if isinstance(out, dict) else []),
        "confidence": conf_val,
    }


def run_one(scenario: dict, use_planner: bool = True, api_url: str | None = None, token: str | None = None) -> tuple[dict, dict | None, str | None]:
    """
    Run a single scenario. Returns (result_dict, error_detail, error_message).
    If use_planner=True, calls agent.planner.run_planner directly (no auth).
    If use_planner=False, POSTs to api_url with token.
    """
    question = scenario.get("question", "")
    service = scenario.get("service") or ""
    env = scenario.get("env") or ""
    time_preset = scenario.get("time_preset") or "1h"

    if use_planner:
        from benchmarks.grader import get_time_range
        from agent.planner import PlannerInput, run_planner

        tr = get_time_range(time_preset)
        inp = PlannerInput(question=question, service=service or None, env=env or None, time_range=tr)
        try:
            out = run_planner(inp)
            result = _planner_output_to_result(out)
            # Ensure executive_summary is list of dicts with 'text'
            if hasattr(out, "executive_summary") and out.executive_summary and not result.get("executive_summary"):
                result["executive_summary"] = [{"text": getattr(b, "text", b) if not isinstance(b, dict) else b.get("text", "")} for b in out.executive_summary]
            return result, None, None
        except Exception as e:
            return {}, {"exception": str(e)}, str(e)
    else:
        import urllib.request
        from benchmarks.grader import get_time_range
        tr = list(get_time_range(time_preset))
        body = json.dumps({"question": question, "service": service or None, "env": env or None, "time_range": tr}).encode("utf-8")
        req = urllib.request.Request(
            f"{api_url.rstrip('/')}/debug",
            data=body,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode())
                return _planner_output_to_result(data), None, None
        except Exception as e:
            return {}, {"exception": str(e)}, str(e)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run ObsAgentBench scenarios")
    parser.add_argument("--scenarios", type=Path, default=DEFAULT_SCENARIOS_DIR, help="Directory of scenario JSON files")
    parser.add_argument("--list", action="store_true", help="Only list scenarios and exit")
    parser.add_argument("--api", type=str, default=None, help="Use HTTP API instead of planner (e.g. http://127.0.0.1:8765)")
    parser.add_argument("--token", type=str, default=None, help="JWT token for API mode")
    parser.add_argument("--verbose", "-v", action="store_true", help="Print per-check details")
    args = parser.parse_args()

    scenarios_dir = args.scenarios
    if not scenarios_dir.is_dir():
        print(f"Scenarios directory not found: {scenarios_dir}", file=sys.stderr)
        return 1

    scenarios = _load_scenarios(scenarios_dir)
    if not scenarios:
        print("No scenarios found.", file=sys.stderr)
        return 1

    if args.list:
        for s in scenarios:
            print(f"  {s.get('id', '?')}  {s.get('family', '?')}  {s.get('name', '')}")
        return 0

    use_planner = not args.api
    if args.api and not args.token:
        print("Warning: --api requires --token for /debug.", file=sys.stderr)

    # Ensure project root is on path for agent imports
    if str(PROJECT_ROOT) not in sys.path:
        sys.path.insert(0, str(PROJECT_ROOT))

    from benchmarks.grader import grade

    results = []
    for scenario in scenarios:
        sid = scenario.get("id", "?")
        family = scenario.get("family", "?")
        result_dict, err_detail, err_msg = run_one(scenario, use_planner=use_planner, api_url=args.api, token=args.token)
        if err_msg:
            passed = False
            details = {"passed": False, "error": err_msg, "checks": {}}
        else:
            passed, details = grade(scenario, result_dict)
        results.append({
            "id": sid,
            "name": scenario.get("name", ""),
            "family": family,
            "passed": passed,
            "confidence": result_dict.get("confidence"),
            "findings_count": len(result_dict.get("findings") or []),
            "remediations_count": len(result_dict.get("proposed_fixes") or []),
            "details": details,
        })

    # Table
    print("\nObsAgentBench results")
    print("-" * 80)
    for r in results:
        status = "PASS" if r["passed"] else "FAIL"
        conf = r.get("confidence")
        conf_str = f"{conf * 100:.0f}%" if conf is not None else "—"
        print(f"  {status}  {r['id']:30}  {r['family']:12}  conf={conf_str:>4}  findings={r['findings_count']}  remed={r['remediations_count']}")
        if args.verbose and not r["passed"] and r.get("details"):
            if r["details"].get("error"):
                print(f"         └ error: {r['details']['error']}")
            for k, v in (r["details"].get("checks") or {}).items():
                if isinstance(v, dict) and v.get("passed") is False:
                    print(f"         └ {k}: {v}")
    print("-" * 80)

    # Summary by family
    by_family: dict[str, list] = {}
    for r in results:
        by_family.setdefault(r["family"], []).append(r)
    print("\nBy family:")
    for fam, runs in sorted(by_family.items()):
        passed = sum(1 for r in runs if r["passed"])
        print(f"  {fam}: {passed}/{len(runs)} passed")
    overall = sum(1 for r in results if r["passed"])
    print(f"\nOverall: {overall}/{len(results)} passed")
    return 0 if overall == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
