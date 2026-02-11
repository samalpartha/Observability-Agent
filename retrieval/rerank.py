"""
Rerank hybrid results. Optional step after fusion for improved relevance.
"""
from typing import List, TypeVar

from retrieval.hybrid_query import HybridResult

T = TypeVar("T", bound=HybridResult)


def rerank_by_fused(results: List[T], top_k: int = 10) -> List[T]:
    """Return top_k by fused score (already sorted from hybrid_query; slice)."""
    return results[:top_k]


def rerank_by_vector(results: List[T], top_k: int = 10) -> List[T]:
    """Return top_k by vector score when vector signal is strong."""
    sorted_by_vec = sorted(results, key=lambda r: (r.score_vector, r.score_fused), reverse=True)
    return sorted_by_vec[:top_k]
