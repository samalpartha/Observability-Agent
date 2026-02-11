# Runbooks

## High latency / P99 spike

1. Confirm scope: service, env, time range.
2. Gather: logs (errors, timeouts), traces (slow spans), metrics (CPU/memory/latency).
3. Correlate by trace.id and deployment.id.
4. Check similar incidents for known causes (e.g. bad deploy, dependency).
5. Propose: rollback, scale, or dependency fix with risk level.

## Error rate increase

1. Scope: service, env, time range.
2. Logs (error level), traces (failed), metrics (error rate).
3. Correlate; retrieve similar incidents.
4. Propose: revert, fix config, or scale.

## Resource exhaustion

1. Scope: service, env, time range.
2. Metrics (CPU, memory, disk), logs (OOM, throttling).
3. Similar incidents; propose scale or limit increase.
