# Agent Builder spec – tool mapping

Same tools can be exposed to Elastic Agent Builder / ingest pipeline or a custom agent runner.

| Internal tool (Python)        | Agent Builder / API usage |
|------------------------------|----------------------------|
| `tool_find_changes`          | Query obs-logs for deploy/release events in time range + service. |
| `tool_search_logs`           | Hybrid search over obs-logs-current; returns evidence + Kibana Discover links. |
| `tool_search_traces`        | Hybrid search over obs-traces-current; returns evidence + APM trace links. |
| `tool_search_metrics`       | Hybrid search over obs-metrics-current; returns evidence + dashboard links. |
| `tool_find_similar_incidents`| Vector search obs-incidents-current; returns top 5 with fix_steps. |
| `tool_propose_fix`          | Input: findings + incidents. Output: proposed actions (LLM or rules). |
| `tool_generate_runbook`     | Input: proposed_fix + context. Output: runbook steps. |

## Input/output contract

- Every tool returns: `{ summary, evidence[], raw_payload }`.
- Evidence items include `links[]` with `kind`, `label`, `url` for Kibana/APM/dashboard.

## Deterministic workflow (planner)

1. Confirm scope: service, env, time range.
2. Gather signals: logs, traces, metrics, changes.
3. Correlate by trace.id / deployment.id.
4. Retrieve similar incidents.
5. Propose top 3 root cause candidates.
6. Propose top 3 remediations with risk level.

Validators: block unsupported actions; require ≥ N evidence and citations before propose.
