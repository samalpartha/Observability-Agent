# Elastic Workflows (Observability)

Sample [Elastic Workflows](https://www.elastic.co/docs/explore-analyze/alerts-cases/workflows) for use with the Observability Copilot and [Elastic Agent Builder Hackathon](https://elasticsearch.devpost.com/).

## Import in Kibana

1. Open **Kibana** → **Management** → **Workflows**.
2. Click **Create workflow**.
3. Paste the contents of a YAML file (e.g. `observability/fetch-logs-for-service.yaml`).
4. Adjust the step type if your Kibana version uses different action names (e.g. `elasticsearch.search` instead of `elasticsearch.esql.query`).
5. Save and run manually or attach to a trigger.

## Workflows

| File | Description |
|------|-------------|
| `observability/fetch-logs-for-service.yaml` | Fetches log documents for a given service and time range from `obs-logs-current`. Inputs: `service_name`, optional `start_time`, `limit`. |

## References

- [elastic/workflows](https://github.com/elastic/workflows) — Elastic’s workflow examples and schema
- [Elastic Workflows docs](https://www.elastic.co/docs/explore-analyze/alerts-cases/workflows) — Triggers, steps, and templating
