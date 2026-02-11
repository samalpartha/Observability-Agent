# Benchmark scenarios

Each scenario is a JSON file with:

- **id**: unique id (e.g. `latency_checkout_01`)
- **name**: short description
- **family**: `root_cause` | `evidence` | `remediation` | `case_creation` | `long_horizon`
- **question**: natural language question for the agent
- **service**: (optional) service filter
- **env**: (optional) environment filter
- **time_preset**: (optional) `15m` | `1h` | `6h` | `24h` (default `1h`)
- **expected_root_cause_keywords**: (optional) list of strings; at least one must appear in root cause text (case-insensitive)
- **expected_evidence_min_count**: (optional) minimum number of findings
- **required_remediation_min_count**: (optional) minimum number of proposed fixes
- **min_confidence**: (optional) minimum confidence score in [0, 1] to pass

Grading: a scenario **passes** if every specified expectation is met. Unspecified fields are not checked.
