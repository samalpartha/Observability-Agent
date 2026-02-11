"""
Embedding generation: embed_text, batch embed, cache by content hash.
Returns vector and model id. Option A: client-side before indexing; Option B: offline job.
"""
import hashlib
import os
from typing import Optional

# Lazy load to avoid heavy import when not used
_sentence_transformers = None
_embedding_error: Optional[Exception] = None


class EmbeddingUnavailableError(Exception):
    """Raised when the embedding model cannot be loaded (e.g. NumPy/PyTorch mismatch)."""
    pass


def _get_model():
    global _sentence_transformers, _embedding_error
    if _embedding_error is not None:
        raise EmbeddingUnavailableError(str(_embedding_error))
    if _sentence_transformers is None:
        try:
            from sentence_transformers import SentenceTransformer
            from app.config import EMBEDDING_MODEL
            _sentence_transformers = SentenceTransformer(EMBEDDING_MODEL)
        except BaseException as e:
            _embedding_error = e
            raise EmbeddingUnavailableError(
                f"Embedding model failed to load (e.g. NumPy/PyTorch mismatch): {e!r}. "
                "Try: pip install \"numpy<2\" or upgrade PyTorch."
            ) from e
    return _sentence_transformers


MODEL_ID = os.environ.get("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
EMBEDDING_VERSION = "v1"
_CACHE: dict[str, list[float]] = {}


def _content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def embed_text(text: str, use_cache: bool = True) -> tuple[list[float], str, str]:
    """
    Embed a single text. Returns (vector, model_id, embedding_version).
    use_cache: if True, reuse by content hash to save cost.
    """
    if not (text or "").strip():
        raise ValueError("embed_text requires non-empty text")
    key = _content_hash(text) if use_cache else None
    if use_cache and key and key in _CACHE:
        return _CACHE[key], MODEL_ID, EMBEDDING_VERSION
    model = _get_model()
    vector = model.encode(text, convert_to_numpy=True).tolist()
    if use_cache and key:
        _CACHE[key] = vector
    return vector, MODEL_ID, EMBEDDING_VERSION


def embed_batch(texts: list[str], use_cache: bool = True) -> list[tuple[list[float], str, str]]:
    """Batch embed; uses cache per item. Returns list of (vector, model_id, embedding_version)."""
    if not texts:
        return []
    out: list[tuple[list[float], str, str]] = [None] * len(texts)  # type: ignore
    to_compute: list[str] = []
    slot_indices: list[int] = []
    keys_for_slots: list[Optional[str]] = []
    for i, t in enumerate(texts):
        t = (t or "").strip()
        if not t:
            out[i] = ([], MODEL_ID, EMBEDDING_VERSION)
            continue
        key = _content_hash(t) if use_cache else None
        if use_cache and key and key in _CACHE:
            out[i] = (_CACHE[key], MODEL_ID, EMBEDDING_VERSION)
        else:
            to_compute.append(t)
            slot_indices.append(i)
            keys_for_slots.append(key)
    if to_compute:
        model = _get_model()
        vectors = model.encode(to_compute, convert_to_numpy=True)
        for idx, key, vec in zip(slot_indices, keys_for_slots, vectors.tolist()):
            if use_cache and key:
                _CACHE[key] = vec
            out[idx] = (vec, MODEL_ID, EMBEDDING_VERSION)
    return out
