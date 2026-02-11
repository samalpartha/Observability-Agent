"""
Ingest pipeline obs_enrich_v1: default env, parse log formats, derive service.name, copy message to message_raw.
"""
from elasticsearch import Elasticsearch

PIPELINE_ID = "obs_enrich_v1"

PIPELINE_BODY = {
    "description": "Observability enrichment: defaults, parsing, service derivation",
    "processors": [
        {"set": {"field": "env", "value": "default", "override": False, "if": "ctx.env == null"}},
        {"set": {"field": "message_raw", "value": "{{message}}", "override": False, "if": "ctx.message != null"}},
        {
            "grok": {
                "field": "message",
                "patterns": ["%{TIMESTAMP_ISO8601:ts} %{LOGLEVEL:level} %{GREEDYDATA:msg}"],
                "ignore_failure": True,
            }
        },
        {"set": {"field": "service.name", "value": "{{logger_name}}", "override": False, "if": "ctx.logger_name != null"}},
        {"set": {"field": "service.name", "value": "{{kubernetes.labels.app}}", "override": False, "if": "ctx.kubernetes?.labels?.app != null"}},
    ],
}


def setup_pipeline(client: Elasticsearch) -> None:
    """Create or update ingest pipeline obs_enrich_v1."""
    client.ingest.put_pipeline(id=PIPELINE_ID, body=PIPELINE_BODY)
