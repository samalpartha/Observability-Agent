"""
Hybrid retrieval: lexical + vector with RRF fusion.
Inputs: user question, time range, service/env filters, top_k.
Apply strict filters first, then search; return results with score parts and evidence fields.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from elasticsearch import Elasticsearch

from retrieval.embedder import embed_text, EmbeddingUnavailableError

# RRF constant
RRF_K = 60


@dataclass
class HybridResult:
    index: str
    doc_id: str
    score_lexical: float
    score_vector: float
    score_fused: float
    message: Optional[str] = None
    timestamp: Optional[str] = None
    service_name: Optional[str] = None
    trace_id: Optional[str] = None
    span_id: Optional[str] = None
    raw: Optional[dict[str, Any]] = None


def _rrf_score(rank: int) -> float:
    return 1.0 / (RRF_K + rank)


def hybrid_query(
    client: Elasticsearch,
    question: str,
    *,
    time_range: Optional[tuple[str, str]] = None,
    service: Optional[str] = None,
    env: Optional[str] = None,
    index_alias: str = "obs-logs-current",
    top_k: int = 20,
) -> list[HybridResult]:
    """
    Run lexical + vector search with filters, then fuse with RRF.
    time_range: (gte, lte) for @timestamp.
    """
    # Filters (strict, applied first)
    must = []
    if time_range:
        gte, lte = time_range
        must.append({"range": {"@timestamp": {"gte": gte, "lte": lte}}})
    if service:
        must.append({"term": {"service.name": service}})
    if env:
        must.append({"term": {"env": env}})
    bool_filter = {"bool": {"must": must}} if must else {"match_all": {}}

    # Lexical over message and labels
    lexical_query = {
        "bool": {
            "must": [{"bool": {"filter": [bool_filter]}}],
            "should": [
                {"match": {"message": {"query": question, "boost": 1}}},
                {"match": {"tags": {"query": question, "boost": 0.5}}},
            ],
        }
    }

    # Vector from question when embedding model is available; otherwise lexical-only
    vector_resp: dict = {"hits": {"hits": []}}
    try:
        vector, _, _ = embed_text(question)
        knn_clause = {"field": "embedding", "query_vector": vector, "k": top_k * 2, "num_candidates": max(100, top_k * 4)}
        vector_query = {
            "bool": {
                "must": [
                    {"bool": {"filter": [bool_filter]}},
                    {"knn": knn_clause},
                ]
            }
        }
        vector_resp = client.search(
            index=index_alias,
            body={"query": vector_query, "size": top_k * 2, "_source": True},
        )
    except (EmbeddingUnavailableError, Exception):
        # Run lexical-only when embeddings unavailable or any embedder failure (e.g. NumPy/PyTorch mismatch)
        pass

    # Execute lexical (and vector was already run above when embeddings available)
    lexical_resp = client.search(
        index=index_alias,
        body={"query": lexical_query, "size": top_k * 2, "_source": True},
    )

    # RRF fusion by _id
    scores: dict[str, tuple[float, float, float]] = {}
    doc_map: dict[str, dict] = {}

    for rank, hit in enumerate(lexical_resp.get("hits", {}).get("hits", [])):
        doc_id = hit["_id"]
        doc_map[doc_id] = hit.get("_source", {})
        lex = hit.get("_score") or 0.0
        prev = scores.get(doc_id, (0.0, 0.0, 0.0))
        scores[doc_id] = (prev[0] + _rrf_score(rank), prev[1], prev[2])

    for rank, hit in enumerate(vector_resp.get("hits", {}).get("hits", [])):
        doc_id = hit["_id"]
        doc_map.setdefault(doc_id, hit.get("_source", {}))
        vec = hit.get("_score") or 0.0
        prev = scores.get(doc_id, (0.0, 0.0, 0.0))
        scores[doc_id] = (prev[0], prev[1] + _rrf_score(rank), prev[2])

    for doc_id, (lex_sum, vec_sum, _) in scores.items():
        fused = _rrf_score(0)  # placeholder; we'll set fused = lex_sum + vec_sum
        fused = lex_sum + vec_sum
        scores[doc_id] = (lex_sum, vec_sum, fused)

    # Sort by fused, take top_k
    order = sorted(scores.keys(), key=lambda x: -scores[x][2])[:top_k]
    results = []
    for doc_id in order:
        src = doc_map.get(doc_id, {})
        lex_s, vec_s, fused_s = scores[doc_id]
        results.append(
            HybridResult(
                index=index_alias,
                doc_id=doc_id,
                score_lexical=lex_s,
                score_vector=vec_s,
                score_fused=fused_s,
                message=src.get("message"),
                timestamp=src.get("@timestamp"),
                service_name=src.get("service", {}).get("name") if isinstance(src.get("service"), dict) else None,
                trace_id=src.get("trace", {}).get("id") if isinstance(src.get("trace"), dict) else None,
                span_id=src.get("span", {}).get("id") if isinstance(src.get("span"), dict) else None,
                raw=src,
            )
        )
    return results
