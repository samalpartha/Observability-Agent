"""
Vector search on obs-incidents-current for similar past incidents; return top 5 with fix_steps.
"""
from dataclasses import dataclass
from typing import Any, Optional

from elasticsearch import Elasticsearch

from retrieval.embedder import embed_text, EmbeddingUnavailableError


@dataclass
class SimilarIncident:
    incident_id: str
    title: Optional[str]
    symptom_summary: Optional[str]
    root_cause: Optional[str]
    fix_steps: Optional[str]
    postmortem_url: Optional[str]
    tags: list[str]
    service_name: Optional[str]
    score: float
    raw: Optional[dict[str, Any]] = None


def similar_incidents(
    client: Elasticsearch,
    question: str,
    *,
    service: Optional[str] = None,
    env: Optional[str] = None,
    top_k: int = 5,
    index_alias: str = "obs-incidents-current",
) -> list[SimilarIncident]:
    """
    Vector search incidents by query embedding; filter by service if provided.
    Returns top_k incidents with fix_steps. Returns [] when embedding model is unavailable.
    """
    try:
        vector, _, _ = embed_text(question)
    except EmbeddingUnavailableError:
        return []

    # kNN query (ES 8: field, query_vector, k, num_candidates)
    query = {"knn": {"field": "embedding", "query_vector": vector, "k": top_k * 2, "num_candidates": max(100, top_k * 4)}}

    resp = client.search(
        index=index_alias,
        body={
            "query": query,
            "size": top_k * 2,
            "_source": ["incident_id", "title", "symptom_summary", "root_cause", "fix_steps", "postmortem_url", "tags", "service"],
        },
    )
    hits = resp.get("hits", {}).get("hits", [])
    out = []
    for h in hits:
        src = h.get("_source") or {}
        svc = src.get("service")
        if service and (isinstance(svc, dict) and svc.get("name") != service):
            continue
        if env and src.get("env") != env:
            continue
        if len(out) >= top_k:
            break
        out.append(
            SimilarIncident(
                incident_id=src.get("incident_id", ""),
                title=src.get("title"),
                symptom_summary=src.get("symptom_summary"),
                root_cause=src.get("root_cause"),
                fix_steps=src.get("fix_steps"),
                postmortem_url=src.get("postmortem_url"),
                tags=src.get("tags") or [],
                service_name=svc.get("name") if isinstance(svc, dict) else None,
                score=float(h.get("_score") or 0),
                raw=src,
            )
        )
    return out
