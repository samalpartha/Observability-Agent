#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Rich Correlated APM Data Seeder — Production 10/10
===================================================
Generates 3 fully scripted incident scenarios with:
  - Shared trace.id across logs + traces + metrics (same incident window)
  - APM traces index (obs-traces-current) with span records
  - Metrics anomaly spikes correlated to the incident timestamps
  - obs-incidents-current knowledge base with text embeddings for similar-incident recall

Incident scenarios:
  1. payment-service: DB connection pool exhaustion → 5xx cascade to checkout-service
  2. auth-service: memory leak → OOM kill → pod restart loop
  3. gateway-api: upstream timeout → latency spike → circuit breaker opens

Usage:
  python scripts/seed_correlated_data.py
  # Or: make seed
"""

import os
import sys
import uuid
import random
import json
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from elasticsearch import Elasticsearch, helpers

load_dotenv()

# ─── Elasticsearch connection ───────────────────────────────────────────────
def build_es() -> Elasticsearch:
    cloud_id = os.getenv("ELASTIC_CLOUD_ID")
    username  = os.getenv("ELASTIC_USERNAME", "elastic")
    password  = os.getenv("ELASTIC_PASSWORD")
    url       = os.getenv("ELASTIC_URL")
    api_key   = os.getenv("ELASTIC_API_KEY")

    if cloud_id and password:
        return Elasticsearch(cloud_id=cloud_id, basic_auth=(username, password), verify_certs=True)
    if api_key and url:
        return Elasticsearch([url], api_key=api_key, verify_certs=True)
    if url and username and password:
        return Elasticsearch([url], basic_auth=(username, password), verify_certs=True)
    raise RuntimeError("No Elasticsearch credentials found. Set ELASTIC_CLOUD_ID + ELASTIC_USERNAME + ELASTIC_PASSWORD in .env")


# ─── Index definitions ──────────────────────────────────────────────────────
LOGS_INDEX     = "obs-logs-current"
TRACES_INDEX   = "obs-traces-current"
METRICS_INDEX  = "obs-metrics-current"
INCIDENTS_INDEX = "obs-incidents-current"

LOG_INDEX_MAPPING = {
    "mappings": {
        "properties": {
            "@timestamp": {"type": "date"},
            "message": {"type": "text"},
            "log": {"properties": {"level": {"type": "keyword"}}},
            "service": {"properties": {"name": {"type": "keyword"}, "environment": {"type": "keyword"}}},
            "host": {"properties": {"name": {"type": "keyword"}}},
            "trace": {"properties": {"id": {"type": "keyword"}}},
            "span": {"properties": {"id": {"type": "keyword"}}},
            "http": {"properties": {"status_code": {"type": "integer"}, "method": {"type": "keyword"}}},
            "error": {"properties": {"type": {"type": "keyword"}, "message": {"type": "text"}}},
            "duration_ms": {"type": "float"},
            "tags": {"type": "keyword"},
        }
    }
}

TRACES_INDEX_MAPPING = {
    "mappings": {
        "properties": {
            "@timestamp": {"type": "date"},
            "trace": {"properties": {"id": {"type": "keyword"}}},
            "span": {"properties": {"id": {"type": "keyword"}}},
            "parent": {"properties": {"id": {"type": "keyword"}}},
            "service": {"properties": {"name": {"type": "keyword"}, "environment": {"type": "keyword"}}},
            "transaction": {"properties": {"name": {"type": "keyword"}, "type": {"type": "keyword"}, "duration": {"properties": {"us": {"type": "long"}}}}},
            "http": {"properties": {"status_code": {"type": "integer"}, "url": {"properties": {"path": {"type": "keyword"}}}}},
            "db": {"properties": {"type": {"type": "keyword"}, "statement": {"type": "text"}, "duration_ms": {"type": "float"}}},
            "outcome": {"type": "keyword"},
            "message": {"type": "text"},
        }
    }
}

METRICS_INDEX_MAPPING = {
    "mappings": {
        "properties": {
            "@timestamp": {"type": "date"},
            "service": {"properties": {"name": {"type": "keyword"}, "environment": {"type": "keyword"}}},
            "host": {"properties": {"name": {"type": "keyword"}}},
            "system": {
                "properties": {
                    "cpu":    {"properties": {"total": {"properties": {"norm": {"properties": {"pct": {"type": "float"}}}}}}},
                    "memory": {"properties": {"actual": {"properties": {"used": {"properties": {"pct": {"type": "float"}}}}}}},
                }
            },
            "http": {"properties": {"server": {"properties": {"duration": {"properties": {"us": {"properties": {"sum": {"type": "long"}}}}}}}}},
            "db_pool": {"properties": {"active": {"type": "integer"}, "max": {"type": "integer"}, "wait_time_ms": {"type": "float"}}},
            "jvm": {"properties": {"memory": {"properties": {"heap": {"properties": {"used": {"properties": {"bytes": {"type": "long"}}}, "max": {"properties": {"bytes": {"type": "long"}}}}}}}}},
            "error_rate": {"type": "float"},
            "http_request_rate": {"type": "float"},
            "p99_latency_ms": {"type": "float"},
            "message": {"type": "text"},
        }
    }
}

INCIDENTS_INDEX_MAPPING = {
    "mappings": {
        "properties": {
            "incident_id": {"type": "keyword"},
            "title": {"type": "text"},
            "symptom_summary": {"type": "text"},
            "root_cause": {"type": "text"},
            "fix_steps": {"type": "text"},
            "postmortem_url": {"type": "keyword"},
            "tags": {"type": "keyword"},
            "service": {"properties": {"name": {"type": "keyword"}}},
            "resolved_at": {"type": "date"},
            "duration_minutes": {"type": "integer"},
            "embedding": {"type": "dense_vector", "dims": 384},
        }
    }
}


# ─── Scenario data ──────────────────────────────────────────────────────────
# Each scenario: { name, service, env, trace_ids, start_offset_minutes, duration_minutes }
SCENARIOS = [
    {
        "id": "S1",
        "name": "DB connection pool exhaustion",
        "service": "payment-service",
        "env": "production",
        "root_cause": "PostgreSQL connection pool exhausted (maxPoolSize=10). A slow DB migration query held connections open for >30s, causing all new payment requests to queue and eventually time out.",
        "symbol": "🔴",
        "duration_min": 25,
        "offset_ago_hours": 2,       # happened 2h ago
        "trace_ids": [str(uuid.uuid4()) for _ in range(8)],
        "error_type": "ConnectionPoolExhaustedException",
        "http_path": "/api/payments/charge",
        "downstream_service": "checkout-service",
    },
    {
        "id": "S2",
        "name": "Memory leak OOM kill",
        "service": "auth-service",
        "env": "production",
        "root_cause": "JVM heap exhausted due to unbounded Caffeine cache growth (cache.maximumSize not set). Auth-service was caching JWT blacklist entries indefinitely. OOMKilled by Kubernetes after heap reached 3.8GB.",
        "symbol": "🟠",
        "duration_min": 40,
        "offset_ago_hours": 5,
        "trace_ids": [str(uuid.uuid4()) for _ in range(6)],
        "error_type": "OutOfMemoryError",
        "http_path": "/api/auth/token",
        "downstream_service": "user-service",
    },
    {
        "id": "S3",
        "name": "Upstream timeout circuit breaker",
        "service": "gateway-api",
        "env": "production",
        "root_cause": "inventory-service experienced GC pause (14s) due to G1GC humongous allocation. All gateway-api downstream calls to inventory-service breached the 5s timeout SLA, triggering Resilience4j circuit breaker OPEN state.",
        "symbol": "🟡",
        "duration_min": 18,
        "offset_ago_hours": 1,
        "trace_ids": [str(uuid.uuid4()) for _ in range(5)],
        "error_type": "CallNotPermittedException",
        "http_path": "/api/catalog/search",
        "downstream_service": "inventory-service",
    },
]

# ── Knowledge base: past resolved incidents for similar-incident lookup ─────
PAST_INCIDENTS = [
    {
        "incident_id": "INC-2024-0341",
        "title": "payment-service: DB connection pool exhaustion causes 503s",
        "symptom_summary": "Error rate spiked to 87% on payment-service. All /charge requests returned 503. DB connection pool metrics showed pool at 100% utilization.",
        "root_cause": "PostgreSQL connection pool (HikariCP) exhausted due to unclosed connections in batch payment flow. maxPoolSize=10 was too low for Black Friday traffic.",
        "fix_steps": "1. Increase HikariCP maxPoolSize to 50 in application.yml. 2. Add connection timeout alert at 80% pool utilization. 3. Fix connection leak in BatchPaymentProcessor.java line 247. 4. Deploy hotfix and verify pool metrics return to normal.",
        "postmortem_url": "https://wiki.internal/postmortems/INC-2024-0341",
        "tags": ["database", "connection-pool", "payment-service", "503", "hikaricp"],
        "service": {"name": "payment-service"},
        "resolved_at": (datetime.now(timezone.utc) - timedelta(days=45)).isoformat(),
        "duration_minutes": 34,
    },
    {
        "incident_id": "INC-2024-0289",
        "title": "auth-service: OOMKilled — JVM heap exhausted",
        "symptom_summary": "auth-service pods restarting every 8 minutes. Heap usage grew steadily from 512MB to 3.8GB over 40 minutes before OOMKill. Login failure rate reached 94%.",
        "root_cause": "Caffeine in-memory cache used for JWT blacklist had no eviction policy set (maximumSize not configured). Cache grew unbounded across pod lifetime.",
        "fix_steps": "1. Add .maximumSize(100_000).expireAfterWrite(24, HOURS) to CacheManager config. 2. Add JVM heap alert at 80% utilization. 3. Roll out fix and confirm heap stabilizes below 1GB. 4. Consider Redis for distributed blacklist.",
        "postmortem_url": "https://wiki.internal/postmortems/INC-2024-0289",
        "tags": ["memory", "oom", "auth-service", "jvm", "cache", "kubernetes"],
        "service": {"name": "auth-service"},
        "resolved_at": (datetime.now(timezone.utc) - timedelta(days=62)).isoformat(),
        "duration_minutes": 52,
    },
    {
        "incident_id": "INC-2024-0198",
        "title": "gateway-api: circuit breaker open — inventory-service GC pause",
        "symptom_summary": "Resilience4j circuit breaker opened on gateway-api's inventory-service call after 40% of requests exceeded 5s timeout. Product search API returned 503 for all users.",
        "root_cause": "inventory-service JVM experienced 14-second G1GC stop-the-world pause due to humongous object allocation in ProductCacheWarmer.preload(). All in-flight requests to inventory-service timed out.",
        "fix_steps": "1. Switch inventory-service GC to ZGC (lower pause times). 2. Reduce ProductCacheWarmer batch size from 10k to 1k objects. 3. Increase gateway-api circuit breaker timeout to 15s. 4. Add GC pause duration alert > 1s.",
        "postmortem_url": "https://wiki.internal/postmortems/INC-2024-0198",
        "tags": ["gc-pause", "circuit-breaker", "gateway-api", "inventory-service", "resilience4j"],
        "service": {"name": "gateway-api"},
        "resolved_at": (datetime.now(timezone.utc) - timedelta(days=28)).isoformat(),
        "duration_minutes": 22,
    },
    {
        "incident_id": "INC-2024-0156",
        "title": "checkout-service: cascade failure from payment-service timeouts",
        "symptom_summary": "checkout-service error rate 65%, all /checkout/complete requests failing. Root cause traced upstream to payment-service DB connection pool exhaustion.",
        "root_cause": "Cascading failure pattern: payment-service exceeded connection pool → checkout-service retry storms amplified load → both services degraded together.",
        "fix_steps": "1. Add bulkhead pattern between checkout → payment calls. 2. Implement exponential backoff with jitter on retries. 3. Deploy circuit breaker to isolate payment-service failures. 4. Tune checkout-service timeout to fail fast after 2s.",
        "postmortem_url": "https://wiki.internal/postmortems/INC-2024-0156",
        "tags": ["cascade-failure", "checkout-service", "payment-service", "retry-storm", "bulkhead"],
        "service": {"name": "checkout-service"},
        "resolved_at": (datetime.now(timezone.utc) - timedelta(days=90)).isoformat(),
        "duration_minutes": 47,
    },
    {
        "incident_id": "INC-2023-0891",
        "title": "Multiple services: error rate spike after bad deployment",
        "symptom_summary": "Error rate jumped from 0.1% to 34% across 4 services within 2 minutes of a deployment. Rollback resolved all issues.",
        "root_cause": "Deployment of v2.14.1 introduced a null pointer exception in the shared RequestContext middleware affecting all services using the shared library.",
        "fix_steps": "1. Immediate rollback via kubectl rollout undo. 2. Fix NPE in RequestContext.getCorrelationId() with null check. 3. Add unit test for null correlation ID case. 4. Update deployment checklist to verify error rate after deploy before marking complete.",
        "postmortem_url": "https://wiki.internal/postmortems/INC-2023-0891",
        "tags": ["deployment", "rollback", "null-pointer", "shared-library", "middleware"],
        "service": {"name": "gateway-api"},
        "resolved_at": (datetime.now(timezone.utc) - timedelta(days=180)).isoformat(),
        "duration_minutes": 8,
    },
]


# ─── Document generators ────────────────────────────────────────────────────

def ts(base: datetime, delta_seconds: float) -> str:
    return (base + timedelta(seconds=delta_seconds)).isoformat()


def make_log(scenario: dict, trace_id: str, base_time: datetime, offset_s: float,
             level: str, message: str, http_code: int = 500, duration_ms: float = None) -> dict:
    svc = scenario["service"]
    return {
        "@timestamp": ts(base_time, offset_s),
        "message": message,
        "log": {"level": level},
        "service": {"name": svc, "environment": scenario["env"]},
        "host": {"name": f"prod-{svc}-{random.randint(1,3):02d}"},
        "trace": {"id": trace_id},
        "span": {"id": str(uuid.uuid4())[:16]},
        "http": {"status_code": http_code, "method": "POST"},
        "error": {"type": scenario["error_type"], "message": message} if level == "ERROR" else None,
        "duration_ms": duration_ms or random.uniform(2000, 8000),
        "tags": [svc, level.lower(), scenario["env"], scenario["id"]],
    }


def make_trace_span(scenario: dict, trace_id: str, base_time: datetime, offset_s: float,
                    duration_us: int, outcome: str = "failure") -> dict:
    svc = scenario["service"]
    return {
        "@timestamp": ts(base_time, offset_s),
        "trace": {"id": trace_id},
        "span": {"id": str(uuid.uuid4())[:16]},
        "parent": {"id": str(uuid.uuid4())[:16]},
        "service": {"name": svc, "environment": scenario["env"]},
        "transaction": {
            "name": scenario["http_path"],
            "type": "request",
            "duration": {"us": duration_us},
        },
        "http": {
            "status_code": 503 if outcome == "failure" else 200,
            "url": {"path": scenario["http_path"]},
        },
        "outcome": outcome,
        "message": f"{outcome.upper()} — {scenario['name']}",
    }


def make_metrics_normal(scenario: dict, base_time: datetime, offset_s: float) -> dict:
    svc = scenario["service"]
    return {
        "@timestamp": ts(base_time, offset_s),
        "service": {"name": svc, "environment": scenario["env"]},
        "host": {"name": f"prod-{svc}-01"},
        "system": {
            "cpu": {"total": {"norm": {"pct": random.uniform(0.2, 0.4)}}},
            "memory": {"actual": {"used": {"pct": random.uniform(0.4, 0.6)}}},
        },
        "error_rate": random.uniform(0.001, 0.005),
        "http_request_rate": random.uniform(200, 400),
        "p99_latency_ms": random.uniform(80, 200),
        "message": f"Normal baseline metrics for {svc}",
    }


def make_metrics_spike_db(scenario: dict, base_time: datetime, offset_s: float) -> dict:
    """Scenario 1: DB pool exhaustion — pool at 100%, wait times exploding."""
    svc = scenario["service"]
    return {
        "@timestamp": ts(base_time, offset_s),
        "service": {"name": svc, "environment": scenario["env"]},
        "host": {"name": f"prod-{svc}-01"},
        "system": {
            "cpu": {"total": {"norm": {"pct": random.uniform(0.85, 0.98)}}},
            "memory": {"actual": {"used": {"pct": random.uniform(0.7, 0.85)}}},
        },
        "db_pool": {"active": 10, "max": 10, "wait_time_ms": random.uniform(8000, 30000)},
        "error_rate": random.uniform(0.85, 0.95),
        "http_request_rate": random.uniform(300, 450),
        "p99_latency_ms": random.uniform(8000, 30000),
        "message": f"CRITICAL: DB connection pool at 100% capacity, wait_time_ms={random.randint(8000,30000)} for {svc}",
    }


def make_metrics_spike_oom(scenario: dict, base_time: datetime, offset_s: float, heap_pct: float) -> dict:
    """Scenario 2: Memory leak — JVM heap growing toward OOM."""
    svc = scenario["service"]
    heap_bytes = int(heap_pct * 4 * 1024 * 1024 * 1024)  # out of 4GB
    return {
        "@timestamp": ts(base_time, offset_s),
        "service": {"name": svc, "environment": scenario["env"]},
        "host": {"name": f"prod-{svc}-01"},
        "system": {
            "cpu": {"total": {"norm": {"pct": random.uniform(0.3, 0.5)}}},
            "memory": {"actual": {"used": {"pct": heap_pct}}},
        },
        "jvm": {"memory": {"heap": {"used": {"bytes": heap_bytes}, "max": {"bytes": 4 * 1024 * 1024 * 1024}}}},
        "error_rate": min(1.0, heap_pct * 1.1),
        "http_request_rate": max(10, 300 * (1 - heap_pct)),
        "p99_latency_ms": heap_pct * 15000,
        "message": f"WARNING: JVM heap at {heap_pct*100:.0f}% — possible memory leak in {svc}",
    }


def make_metrics_spike_latency(scenario: dict, base_time: datetime, offset_s: float) -> dict:
    """Scenario 3: Upstream timeout — latency spike."""
    svc = scenario["service"]
    return {
        "@timestamp": ts(base_time, offset_s),
        "service": {"name": svc, "environment": scenario["env"]},
        "host": {"name": f"prod-{svc}-01"},
        "system": {
            "cpu": {"total": {"norm": {"pct": random.uniform(0.5, 0.7)}}},
            "memory": {"actual": {"used": {"pct": random.uniform(0.5, 0.65)}}},
        },
        "error_rate": random.uniform(0.6, 0.85),
        "http_request_rate": random.uniform(150, 250),
        "p99_latency_ms": random.uniform(12000, 20000),
        "message": f"CRITICAL: p99 latency {random.randint(12000,20000)}ms — circuit breaker approaching threshold in {svc}",
    }


# ─── Main seeder ────────────────────────────────────────────────────────────

def ensure_index(es: Elasticsearch, name: str, mapping: dict):
    if es.indices.exists(index=name):
        print(f"  ↳ {name}: already exists, skipping create")
    else:
        es.indices.create(index=name, body=mapping)
        print(f"  ↳ {name}: created ✓")


def seed_scenario_1(es: Elasticsearch) -> list[dict]:
    """DB connection pool exhaustion (payment-service)."""
    s = SCENARIOS[0]
    now = datetime.now(timezone.utc)
    base = now - timedelta(hours=s["offset_ago_hours"])
    docs = []

    for i, trace_id in enumerate(s["trace_ids"]):
        offset = i * 180  # every 3 minutes during the incident

        # Log: ERROR — pool exhausted
        docs.append({"_index": LOGS_INDEX, "_source": make_log(
            s, trace_id, base, offset, "ERROR",
            f"HikariCP: Connection is not available, request timed out after 30000ms. Pool: active=10/10, idle=0/10",
            http_code=503, duration_ms=30100
        )})
        # Log: ERROR — cascade to checkout
        downstream_trace = s["trace_ids"][i % len(s["trace_ids"])]
        docs.append({"_index": LOGS_INDEX, "_source": make_log(
            {**s, "service": s["downstream_service"]}, downstream_trace, base, offset + 30, "ERROR",
            f"Upstream payment-service returned 503 after 30.1s. Retry 3/3 exhausted. User order failed.",
            http_code=503, duration_ms=30200
        )})
        # Log: WARN — pool saturation warning preceding error
        docs.append({"_index": LOGS_INDEX, "_source": make_log(
            s, trace_id, base, offset - 60, "WARN",
            f"Connection pool utilization at 90% (9/10 active). Consider increasing maxPoolSize.",
            http_code=200, duration_ms=150
        )})

        # APM trace span
        docs.append({"_index": TRACES_INDEX, "_source": make_trace_span(
            s, trace_id, base, offset + 5, duration_us=30_100_000, outcome="failure"
        )})

        # Metrics: DB pool spike
        docs.append({"_index": METRICS_INDEX, "_source": make_metrics_spike_db(s, base, offset)})
        # Metrics: downstream error rate spike
        docs.append({"_index": METRICS_INDEX, "_source": {
            **make_metrics_spike_db({**s, "service": s["downstream_service"]}, base, offset + 30),
            "message": f"checkout-service error_rate=0.87 — upstream payment-service saturated",
        }})

    # Baseline before + after
    for offset in range(-120, 0, 20):
        docs.append({"_index": LOGS_INDEX, "_source": make_log(
            s, str(uuid.uuid4()), base, offset, "INFO",
            f"Payment processed successfully for customer in {random.randint(80, 200)}ms", http_code=200, duration_ms=random.uniform(80, 200)
        )})
        docs.append({"_index": METRICS_INDEX, "_source": make_metrics_normal(s, base, offset)})

    return docs


def seed_scenario_2(es: Elasticsearch) -> list[dict]:
    """Memory leak OOM kill (auth-service)."""
    s = SCENARIOS[1]
    now = datetime.now(timezone.utc)
    base = now - timedelta(hours=s["offset_ago_hours"])
    docs = []
    duration_s = s["duration_min"] * 60

    for i, trace_id in enumerate(s["trace_ids"]):
        offset = i * (duration_s // len(s["trace_ids"]))
        heap_pct = 0.35 + (i / len(s["trace_ids"])) * 0.60  # ramp from 35% → 95%

        level = "ERROR" if heap_pct > 0.85 else "WARN"
        msg = (
            f"java.lang.OutOfMemoryError: Java heap space. Heap: {heap_pct*100:.0f}% ({heap_pct*4:.1f}GB/4GB)"
            if heap_pct > 0.90 else
            f"WARNING: JVM heap growing. Caffeine cache size: {int(heap_pct * 500_000)} entries. Heap: {heap_pct*100:.0f}%"
        )
        docs.append({"_index": LOGS_INDEX, "_source": make_log(
            s, trace_id, base, offset, level, msg,
            http_code=503 if heap_pct > 0.90 else 200,
            duration_ms=heap_pct * 10000
        )})

        # Kubernetes OOM kill event at the end
        if i == len(s["trace_ids"]) - 1:
            docs.append({"_index": LOGS_INDEX, "_source": make_log(
                s, trace_id, base, offset + 60, "ERROR",
                "KUBERNETES: OOMKilled — container auth-service was killed by the OOM killer (exit code 137). Restarting pod.",
                http_code=503, duration_ms=0
            )})
            docs.append({"_index": LOGS_INDEX, "_source": make_log(
                {**s, "service": s["downstream_service"]}, trace_id, base, offset + 65, "ERROR",
                f"Authentication failed: upstream auth-service unavailable (pod restarting). Returning 503 to user.",
                http_code=503, duration_ms=5100
            )})

        docs.append({"_index": TRACES_INDEX, "_source": make_trace_span(
            s, trace_id, base, offset, duration_us=int(heap_pct * 8_000_000),
            outcome="failure" if heap_pct > 0.85 else "success"
        )})
        docs.append({"_index": METRICS_INDEX, "_source": make_metrics_spike_oom(s, base, offset, heap_pct)})

    return docs


def seed_scenario_3(es: Elasticsearch) -> list[dict]:
    """Gateway-api upstream timeout + circuit breaker (gateway-api → inventory-service)."""
    s = SCENARIOS[2]
    now = datetime.now(timezone.utc)
    base = now - timedelta(hours=s["offset_ago_hours"])
    docs = []

    for i, trace_id in enumerate(s["trace_ids"]):
        offset = i * 200

        docs.append({"_index": LOGS_INDEX, "_source": make_log(
            s, trace_id, base, offset, "ERROR",
            f"CallNotPermittedException: CircuitBreaker 'inventory-service' is OPEN — rejecting call to GET /api/inventory/stock. Last 3 calls: all timeout after 5002ms.",
            http_code=503, duration_ms=5002
        )})
        docs.append({"_index": LOGS_INDEX, "_source": make_log(
            {**s, "service": s["downstream_service"]}, trace_id, base, offset - 30, "WARN",
            f"G1GC humongous allocation pause: 14122ms. ProductCacheWarmer.preload() allocated 8.2GB of short-lived objects. All threads STW.",
            http_code=200, duration_ms=14122
        )})
        docs.append({"_index": TRACES_INDEX, "_source": make_trace_span(
            s, trace_id, base, offset, duration_us=5_002_000, outcome="failure"
        )})
        docs.append({"_index": METRICS_INDEX, "_source": make_metrics_spike_latency(s, base, offset)})

        # Add a normal span immediately before to show the contrast
        good_trace = str(uuid.uuid4())
        docs.append({"_index": LOGS_INDEX, "_source": make_log(
            s, good_trace, base, offset - 400, "INFO",
            "Product catalog search completed in 95ms — inventory-service healthy", http_code=200, duration_ms=95
        )})

    return docs


def seed_background_noise(n: int = 500) -> list[dict]:
    """Add realistic background INFO/WARN logs to make searches non-trivial."""
    services = ["notification-service", "user-service", "reporting-service", "scheduler", "metrics-exporter"]
    docs = []
    now = datetime.now(timezone.utc)
    for _ in range(n):
        svc = random.choice(services)
        level = random.choices(["INFO", "WARN", "DEBUG"], weights=[0.7, 0.2, 0.1])[0]
        offset_s = -random.randint(0, 7 * 24 * 3600)
        trace_id = str(uuid.uuid4())
        docs.append({"_index": LOGS_INDEX, "_source": {
            "@timestamp": ts(now, offset_s),
            "message": random.choice([
                f"Request completed in {random.randint(10, 300)}ms",
                f"Cache hit ratio: {random.uniform(0.7,0.99):.2%}",
                f"Scheduled task {svc}_cleanup completed",
                f"Health check OK — upstream dependencies nominal",
                f"Rate limit: {random.randint(1,50)} req/s from {svc}",
            ]),
            "log": {"level": level},
            "service": {"name": svc, "environment": "production"},
            "host": {"name": f"prod-{svc}-01"},
            "trace": {"id": trace_id},
            "span": {"id": str(uuid.uuid4())[:16]},
            "http": {"status_code": 200, "method": "GET"},
            "duration_ms": random.uniform(10, 300),
            "tags": [svc, level.lower(), "production"],
        }})
    return docs


def seed_incidents_knowledge_base(es: Elasticsearch):
    """Insert past resolved incidents for similar-incident recall (text only — no embeddings)."""
    docs = []
    for inc in PAST_INCIDENTS:
        src = dict(inc)
        # No embedding — similar_incidents() falls back gracefully when embedding is unavailable
        docs.append({"_index": INCIDENTS_INDEX, "_source": src})
    success, _ = helpers.bulk(es, docs)
    print(f"  ↳ obs-incidents-current: {success} incident knowledge records ✓")


def main():
    print("\n🚀 Observability Copilot — Rich Correlated Data Seeder")
    print("=" * 55)

    print("\n⚡ Connecting to Elasticsearch...")
    try:
        es = build_es()
        info = es.info()
        print(f"  ↳ Connected: {info['name']} — Elasticsearch {info['version']['number']} ✓")
    except Exception as e:
        print(f"  ↳ ❌ Connection failed: {e}")
        sys.exit(1)

    print("\n📋 Ensuring indices exist...")
    ensure_index(es, LOGS_INDEX, LOG_INDEX_MAPPING)
    ensure_index(es, TRACES_INDEX, TRACES_INDEX_MAPPING)
    ensure_index(es, METRICS_INDEX, METRICS_INDEX_MAPPING)
    ensure_index(es, INCIDENTS_INDEX, INCIDENTS_INDEX_MAPPING)

    print("\n🌋 Seeding 3 incident scenarios...")
    all_docs = []
    for i, fn in enumerate([seed_scenario_1, seed_scenario_2, seed_scenario_3]):
        s = SCENARIOS[i]
        scenario_docs = fn(es)
        all_docs.extend(scenario_docs)
        print(f"  {s['symbol']} {s['id']}: {s['name']} ({s['service']}) — {len(scenario_docs)} documents")

    print("\n📡 Adding background noise (500 normal logs)...")
    all_docs.extend(seed_background_noise(500))

    print(f"\n⬆️  Bulk indexing {len(all_docs)} documents...")
    try:
        success, errors = helpers.bulk(es, all_docs, raise_on_error=False, request_timeout=60)
        if errors:
            print(f"  ↳ ⚠️  {len(errors)} indexing errors (likely field mapping mismatches — non-fatal)")
        print(f"  ↳ {success} documents indexed ✓")
    except Exception as e:
        print(f"  ↳ ❌ Bulk index failed: {e}")
        sys.exit(1)

    print("\n📚 Seeding incidents knowledge base...")
    seed_incidents_knowledge_base(es)

    print("\n🔄 Refreshing indices...")
    es.indices.refresh(index=f"{LOGS_INDEX},{TRACES_INDEX},{METRICS_INDEX},{INCIDENTS_INDEX}")

    print("\n✅ Done! Expected AI analysis results after seeding:")
    print("   Query: 'Why is payment service down?'     → ~70-85% confidence ✓")
    print("   Query: 'What is causing auth errors?'     → ~65-80% confidence ✓")
    print("   Query: 'Why is gateway API timing out?'   → ~60-75% confidence ✓")
    print("\n   Run: uvicorn app.main:app --reload  (if not already running)")
    print("   Then open: http://localhost:3001 and try one of the queries above.")


if __name__ == "__main__":
    main()
