"""
Emit logs and traces for two scenarios: normal baseline, latency regression after deploy.
Index into Elastic; store one resolved incident in obs-incidents-current for similarity demo.
"""
from datetime import datetime, timezone, timedelta
import os
import sys

# Ensure project root on path when run as script
_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _root not in sys.path:
    sys.path.insert(0, _root)


def _get_es_client():
    from elastic.client import build_client
    return build_client()


def _get_embedder():
    from retrieval.embedder import embed_text
    return embed_text


def generate_normal_logs(count: int = 20) -> list[dict]:
    """Baseline: normal info/debug logs."""
    base_ts = datetime.now(timezone.utc) - timedelta(minutes=30)
    logs = []
    for i in range(count):
        ts = (base_ts + timedelta(seconds=i * 10)).strftime("%Y-%m-%dT%H:%M:%SZ")
        logs.append({
            "@timestamp": ts,
            "message": f"Request completed successfully id={i}",
            "service": {"name": "checkout-service"},
            "env": "staging",
            "level": "info",
            "trace": {"id": f"trace-normal-{i}"},
            "span": {"id": f"span-{i}"},
        })
    return logs


def generate_latency_regression_logs(count: int = 15) -> list[dict]:
    """After deploy: errors and high latency messages."""
    base_ts = datetime.now(timezone.utc) - timedelta(minutes=10)
    logs = []
    for i in range(count):
        ts = (base_ts + timedelta(seconds=i * 5)).strftime("%Y-%m-%dT%H:%M:%SZ")
        logs.append({
            "@timestamp": ts,
            "message": f"Slow request or timeout latency_regression deploy=v2.1.0",
            "service": {"name": "checkout-service"},
            "env": "staging",
            "level": "error",
            "deployment": {"id": "deploy-abc123"},
            "trace": {"id": f"trace-latency-{i}"},
            "span": {"id": f"span-lat-{i}"},
        })
    return logs


def index_docs(client, index_alias: str, docs: list[dict], embed_message: bool = True) -> None:
    """Index documents; optionally add embedding from message."""
    embed_fn = _get_embedder()
    for d in docs:
        if embed_message and d.get("message"):
            vec, model, ver = embed_fn(d["message"])
            d["embedding"] = vec
            d["embedding_model"] = model
            d["embedding_version"] = ver
        client.index(index=index_alias, document=d)


def ensure_one_incident(client) -> None:
    """Store one resolved incident for similarity demo."""
    embed_fn = _get_embedder()
    text = "Latency regression after deploy; checkout-service timeouts and slow requests. Root cause: new dependency version introduced N+1 queries."
    vec, model, ver = embed_fn(text)
    doc = {
        "@timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "incident_id": "inc-latency-regression-001",
        "title": "Checkout latency regression after v2.1.0 deploy",
        "symptom_summary": "Latency regression after deploy; checkout-service timeouts and slow requests.",
        "root_cause": "New dependency version introduced N+1 queries.",
        "fix_steps": "1. Rollback to v2.0.9 2. Fix N+1 in checkout-service 3. Re-deploy",
        "postmortem_url": "https://wiki.example/postmortem/001",
        "tags": ["latency", "deploy", "checkout"],
        "service": {"name": "checkout-service"},
        "env": "staging",
        "embedding": vec,
        "embedding_model": model,
        "embedding_version": ver,
    }
    client.index(index="obs-incidents-current", document=doc)


def main() -> None:
    client = _get_es_client()
    normal = generate_normal_logs()
    regression = generate_latency_regression_logs()
    index_docs(client, "obs-logs-current", normal)
    index_docs(client, "obs-logs-current", regression)
    ensure_one_incident(client)
    print("Sample data indexed: normal logs, latency regression logs, one incident.")


if __name__ == "__main__":
    main()
