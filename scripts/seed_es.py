import os
import sys
import uuid
import random
import time
from datetime import datetime, timedelta, timezone
from elasticsearch import Elasticsearch
from dotenv import load_dotenv

# Try loading from possible .env locations
load_dotenv("app/.env")
load_dotenv(".env")
load_dotenv(os.path.join(os.path.dirname(__file__), "../.env"))

url = os.getenv("ELASTIC_URL")
api_key = os.getenv("ELASTIC_API_KEY")

if not url:
    print("ELASTIC_URL not found")
    sys.exit(1)

client = Elasticsearch(
    url,
    api_key=api_key,
    request_timeout=30,
    verify_certs=False
)

def bulk_index(index_name, docs):
    actions = []
    for doc in docs:
        actions.append({"index": {"_index": index_name, "_source": doc}})
    # Using helper or simple loop properly
    # For simplicity in this script without helpers
    for doc in docs:
        client.index(index=index_name, document=doc)
    print(f"Indexed {len(docs)} docs into {index_name}")

now = datetime.now(timezone.utc)

# 1. Logs: Create a burst of errors about 10 mins ago
logs = []
trace_id = uuid.uuid4().hex
for i in range(20):
    timestamp = now - timedelta(minutes=10, seconds=i*5)
    
    if i < 5:
        # Pre-incident normal logs
        msg = f"Processed request successfully for user_id={random.randint(1000, 9999)}"
        level = "INFO"
    elif i < 15:
        # The burst
        msg = "Connection timeout to redis-cache-01:6379 after 5000ms"
        level = "ERROR"
    else:
        # Recovery
        msg = "Retrying connection to redis-cache-01..."
        level = "WARN"
        
    logs.append({
        "@timestamp": timestamp.isoformat(),
        "message": f"[{level}] {msg}",
        "service.name": "payment-service",
        "trace.id": trace_id if level == "ERROR" else uuid.uuid4().hex,
        "log.level": level
    })

bulk_index("obs-logs-current", logs)

# 2. Traces: Create a slow trace corresponding to the error
traces = []
span_id_root = uuid.uuid4().hex
span_id_child = uuid.uuid4().hex

# Root span (API request)
traces.append({
    "@timestamp": (now - timedelta(minutes=10, seconds=1)).isoformat(),
    "trace.id": trace_id,
    "span.id": span_id_root,
    "parent.id": None,
    "service.name": "payment-service",
    "span.name": "POST /process-payment",
    "event.duration": 5500000, # 5.5s
    "message": "Payment processing request"
})

# Child span (Redis call - the cause)
traces.append({
    "@timestamp": (now - timedelta(minutes=10, seconds=0.8)).isoformat(),
    "trace.id": trace_id,
    "span.id": span_id_child,
    "parent.id": span_id_root,
    "service.name": "payment-service",
    "span.name": "redis.get",
    "event.duration": 5001000, # 5s timeout
    "message": "Redis GET user_session"
})

bulk_index("obs-traces-current", traces)

# 3. Metrics: CPU spike and Latency spike
metrics = []
for i in range(60):
    timestamp = now - timedelta(minutes=60-i)
    
    # Normal latency 50ms, spike to 5000ms around min 50 (10 mins ago)
    if 45 <= i <= 55:
        latency = random.uniform(2000, 5000)
        cpu = random.uniform(80, 95)
    else:
        latency = random.uniform(20, 80)
        cpu = random.uniform(10, 30)
        
    metrics.append({
        "@timestamp": timestamp.isoformat(),
        "metric.name": "http_request_duration_ms",
        "metric.value": latency,
        "service.name": "payment-service"
    })
    metrics.append({
        "@timestamp": timestamp.isoformat(),
        "metric.name": "system.cpu.usage",
        "metric.value": cpu,
        "service.name": "payment-service"
    })

bulk_index("obs-metrics-current", metrics)

# 4. Similar Incidents
incidents = []
incidents.append({
    "incident_id": "INC-1234",
    "title": "Redis Latency Spike",
    "symptom_summary": "High latency on payment-service, timeouts to Redis.",
    "root_cause": "Redis connection pool exhaustion due to slow queries.",
    "fix_steps": "1. Restart Redis replica. 2. Increase connection pool size in payment-service config.",
    "postmortem_url": "https://wiki.company.com/incidents/INC-1234",
    "service.name": "payment-service",
    "@timestamp": (now - timedelta(days=5)).isoformat()
})

bulk_index("obs-incidents-current", incidents)

print("Data seeding complete.")
