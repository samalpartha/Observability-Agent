"""
Elasticsearch client with connection pooling (singleton).
Reads ELASTIC_CLOUD_ID, ELASTIC_API_KEY, and ELASTIC_URL from environment.
Provides health check and managed client lifecycle.
"""
import threading
from typing import Any, Optional

from elasticsearch import Elasticsearch

from agent.resilience import logger

# ── Connection pool: singleton client ──
_client: Optional[Elasticsearch] = None
_client_lock = threading.Lock()


def _get_config():
    from app.config import ELASTIC_API_KEY, ELASTIC_CLOUD_ID, ELASTIC_URL, ELASTIC_USERNAME, ELASTIC_PASSWORD
    return ELASTIC_URL, ELASTIC_CLOUD_ID, ELASTIC_API_KEY, ELASTIC_USERNAME, ELASTIC_PASSWORD


def build_client(force_new: bool = False) -> Elasticsearch:
    """
    Build or return cached Elasticsearch client.
    Thread-safe singleton — one client per process, connection pooling handled by the ES library.
    """
    global _client
    if _client is not None and not force_new:
        return _client

    with _client_lock:
        # Double-check inside lock
        if _client is not None and not force_new:
            return _client

        url, cloud_id, api_key, username, password = _get_config()

        auth_kwargs: dict = {}
        if username and password:
            auth_kwargs["basic_auth"] = (username, password)
        elif api_key:
            auth_kwargs["api_key"] = api_key
        else:
            raise ValueError("Set ELASTIC_API_KEY or ELASTIC_USERNAME + ELASTIC_PASSWORD in .env.")

        if url:
            _client = Elasticsearch(
                [url],
                **auth_kwargs,
                request_timeout=30,
                max_retries=2,
                retry_on_timeout=True,
                verify_certs=True,
            )
            logger.info(f"Elasticsearch client created for {url}")
        elif cloud_id:
            _client = Elasticsearch(
                cloud_id=cloud_id,
                **auth_kwargs,
                request_timeout=30,
                max_retries=2,
                retry_on_timeout=True,
            )
            logger.info(f"Elasticsearch client created for cloud_id={cloud_id[:20]}...")
        else:
            raise ValueError("Set either ELASTIC_URL or ELASTIC_CLOUD_ID in .env or environment.")

        return _client


def health_check(client: Optional[Elasticsearch] = None) -> dict[str, Any]:
    """
    Ping Elasticsearch and return status for app startup.
    Returns {"ok": True, "cluster_name": "..."} or {"ok": False, "error": "..."}.
    """
    es = client or build_client()
    try:
        info = es.info()
        return {"ok": True, "cluster_name": info.get("cluster_name", "unknown")}
    except Exception as e:
        logger.error(f"Elasticsearch health check failed: {e}")
        return {"ok": False, "error": str(e)}


def close_client() -> None:
    """Close the cached client on shutdown."""
    global _client
    with _client_lock:
        if _client is not None:
            try:
                _client.close()
            except Exception:
                pass
            _client = None
            logger.info("Elasticsearch client closed")
