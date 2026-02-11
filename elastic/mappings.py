"""
Index mappings for observability indices.
Common metadata + vector field; indices: obs-logs-v1, obs-traces-v1, obs-metrics-v1, obs-incidents-v1.
"""
# Default embedding dims for all-MiniLM-L6-v2; override via EMBEDDING_DIM if needed
EMBEDDING_DIM = 384

COMMON_FIELDS = {
    "properties": {
        "@timestamp": {"type": "date"},
        "service": {"properties": {"name": {"type": "keyword"}}},
        "env": {"type": "keyword"},
        "host": {"properties": {"name": {"type": "keyword"}}},
        "trace": {"properties": {"id": {"type": "keyword"}}},
        "span": {"properties": {"id": {"type": "keyword"}}},
        "deployment": {"properties": {"id": {"type": "keyword"}}},
        "message": {"type": "text", "analyzer": "standard"},
        "tags": {"type": "keyword"},
        # Vector fields
        "embedding": {
            "type": "dense_vector",
            "dims": EMBEDDING_DIM,
            "index": True,
            "similarity": "cosine",
        },
        "embedding_model": {"type": "keyword"},
        "embedding_version": {"type": "keyword"},
    }
}

# Logs: common + message_raw for audit
OBS_LOGS_MAPPING = {
    **COMMON_FIELDS,
    "properties": {
        **COMMON_FIELDS["properties"],
        "message_raw": {"type": "text", "index": False},
        "logger": {"type": "keyword"},
        "level": {"type": "keyword"},
        "build": {"properties": {"sha": {"type": "keyword"}}},
        "version": {"type": "keyword"},
        "region": {"type": "keyword"},
        "incident_key": {"type": "keyword"},
    },
}

# Traces: common + span-specific
OBS_TRACES_MAPPING = {
    **COMMON_FIELDS,
    "properties": {
        **COMMON_FIELDS["properties"],
        "transaction": {"properties": {"name": {"type": "keyword"}}},
        "transaction.type": {"type": "keyword"},
        "duration.us": {"type": "long"},
        "build": {"properties": {"sha": {"type": "keyword"}}},
        "version": {"type": "keyword"},
        "region": {"type": "keyword"},
    },
}

# Metrics: common + metric-specific
OBS_METRICS_MAPPING = {
    **COMMON_FIELDS,
    "properties": {
        **COMMON_FIELDS["properties"],
        "metricset.name": {"type": "keyword"},
        "metric.value": {"type": "double"},
        "build": {"properties": {"sha": {"type": "keyword"}}},
        "version": {"type": "keyword"},
        "region": {"type": "keyword"},
    },
}

# Incidents: symptom_summary, root_cause, fix_steps, etc.
OBS_INCIDENTS_MAPPING = {
    "properties": {
        "@timestamp": {"type": "date"},
        "incident_id": {"type": "keyword"},
        "title": {"type": "text", "analyzer": "standard"},
        "symptom_summary": {"type": "text", "analyzer": "standard"},
        "root_cause": {"type": "text", "analyzer": "standard"},
        "fix_steps": {"type": "text", "analyzer": "standard"},
        "postmortem_url": {"type": "keyword", "index": False},
        "tags": {"type": "keyword"},
        "service": {"properties": {"name": {"type": "keyword"}}},
        "env": {"type": "keyword"},
        "embedding": {
            "type": "dense_vector",
            "dims": EMBEDDING_DIM,
            "index": True,
            "similarity": "cosine",
        },
        "embedding_model": {"type": "keyword"},
        "embedding_version": {"type": "keyword"},
    }
}

# Closures: resolved investigation learnings for active memory
OBS_CLOSURES_MAPPING = {
    "properties": {
        "@timestamp": {"type": "date"},
        "run_id": {"type": "keyword"},
        "root_cause": {"type": "text", "analyzer": "standard"},
        "signals_used": {"type": "keyword"},
        "false_leads": {"type": "keyword"},
        "resolution_time_seconds": {"type": "integer"},
        "service": {"type": "keyword"},
        "env": {"type": "keyword"},
        "question": {"type": "text", "analyzer": "standard"},
        "question_keywords": {"type": "keyword"},
    }
}

INDICES = {
    "obs-logs-v1": {"mapping": OBS_LOGS_MAPPING},
    "obs-traces-v1": {"mapping": OBS_TRACES_MAPPING},
    "obs-metrics-v1": {"mapping": OBS_METRICS_MAPPING},
    "obs-incidents-v1": {"mapping": OBS_INCIDENTS_MAPPING},
    "obs-closures-v1": {"mapping": OBS_CLOSURES_MAPPING},
}

ALIASES = {
    "obs-logs-v1": "obs-logs-current",
    "obs-traces-v1": "obs-traces-current",
    "obs-metrics-v1": "obs-metrics-current",
    "obs-incidents-v1": "obs-incidents-current",
    "obs-closures-v1": "obs-closures-current",
}
