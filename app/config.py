"""Load configuration from environment. No secrets in code."""
import os
from typing import Optional


def _str(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    v = (value or "").strip()
    return v if v else None


# Elastic: prefer ELASTIC_URL + ELASTIC_API_KEY for direct Cloud URL
ELASTIC_URL: Optional[str] = _str(os.environ.get("ELASTIC_URL"))
ELASTIC_CLOUD_ID: Optional[str] = _str(os.environ.get("ELASTIC_CLOUD_ID"))
ELASTIC_API_KEY: Optional[str] = _str(os.environ.get("ELASTIC_API_KEY"))
ELASTIC_USERNAME: Optional[str] = _str(os.environ.get("ELASTIC_USERNAME"))
ELASTIC_PASSWORD: Optional[str] = _str(os.environ.get("ELASTIC_PASSWORD"))
# Kibana base URL for deep links (Discover, APM). Server-side only.
KIBANA_URL: Optional[str] = _str(os.environ.get("KIBANA_URL"))
ELASTIC_SPACE_ID: Optional[str] = _str(os.environ.get("ELASTIC_SPACE_ID"))

# Embedding
EMBEDDING_MODEL: str = _str(os.environ.get("EMBEDDING_MODEL")) or "all-MiniLM-L6-v2"

# LLM for copilot – provider and key read from env only (keys in .env, never in code)
LLM_PROVIDER: Optional[str] = _str(os.environ.get("LLM_PROVIDER"))
OPENAI_API_KEY: Optional[str] = _str(os.environ.get("OPENAI_API_KEY"))
GROQ_API_KEY: Optional[str] = _str(os.environ.get("GROQ_API_KEY"))
CEREBRAS_API_KEY: Optional[str] = _str(os.environ.get("CEREBRAS_API_KEY"))
OPENROUTER_API_KEY: Optional[str] = _str(os.environ.get("OPENROUTER_API_KEY"))
MISTRAL_API_KEY: Optional[str] = _str(os.environ.get("MISTRAL_API_KEY"))
GOOGLE_API_KEY: Optional[str] = _str(os.environ.get("GOOGLE_API_KEY"))

# App
DEBUG: bool = os.environ.get("DEBUG", "").lower() in ("1", "true", "yes")
