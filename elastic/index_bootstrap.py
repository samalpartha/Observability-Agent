"""
Create indices if missing, apply mappings, and create aliases.
Aliases: obs-logs-current, obs-traces-current, obs-metrics-current, obs-incidents-current.
"""
from elasticsearch import Elasticsearch

from elastic.mappings import ALIASES, INDICES


def bootstrap(client: Elasticsearch) -> dict[str, bool]:
    """Create each index if missing, put mapping, ensure alias. Returns {index: created}."""
    result = {}
    for index_name, spec in INDICES.items():
        created = False
        if not client.indices.exists(index=index_name):
            client.indices.create(index=index_name, body={"mappings": spec["mapping"]})
            created = True
        else:
            # Ensure mapping is applied (existing index: no-op for existing fields)
            try:
                client.indices.put_mapping(index=index_name, body=spec["mapping"])
            except Exception:
                pass
        alias = ALIASES.get(index_name)
        if alias:
            try:
                client.indices.put_alias(index=index_name, name=alias)
            except Exception:
                pass
        result[index_name] = created
    return result
