# ObsAgentBench

Minimal benchmark suite for the Observability Copilot agent (see **docs/EVALUATION_AND_BENCHMARKING.md**).

## Quick start

From the **project root**:

```bash
# List scenarios
python -m benchmarks.run_benchmark --list

# Run all scenarios (uses planner directly; no server needed)
python -m benchmarks.run_benchmark

# Run with verbose grading details
python -m benchmarks.run_benchmark -v

# Run against live API (e.g. after starting uvicorn)
python -m benchmarks.run_benchmark --api http://127.0.0.1:8765 --token YOUR_JWT
```

Exit code: `0` if all scenarios pass, `1` otherwise (e.g. for CI).

## Scenario format

See **benchmarks/scenarios/README.md**. Each scenario is a JSON file with:

- `id`, `name`, `family` (root_cause | evidence | remediation | case_creation | long_horizon)
- `question`, `service`, `env`, `time_preset`
- Optional grading: `expected_root_cause_keywords`, `expected_evidence_min_count`, `required_remediation_min_count`, `min_confidence`

## Grading

- **Root cause**: at least one of `expected_root_cause_keywords` appears in root cause candidates or executive summary (case-insensitive).
- **Evidence**: number of findings ≥ `expected_evidence_min_count` (if set).
- **Remediation**: number of proposed fixes ≥ `required_remediation_min_count` (if set).
- **Confidence**: agent confidence ≥ `min_confidence` (if set).

A scenario **passes** only if every specified check passes.

## Adding scenarios

Add a new `.json` file under `benchmarks/scenarios/` with the same structure as the existing ones. Re-run the benchmark to include it.
