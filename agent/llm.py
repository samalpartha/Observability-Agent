"""
LLM calls for root cause synthesis, remediation, and runbook generation.
Uses LiteLLM with retry logic, circuit breaker, rate limit handling, and fallback chain.
"""
import time
from typing import Optional

from agent.resilience import (
    CircuitOpen,
    get_breaker,
    logger,
    retry_with_backoff,
    sanitize_user_input,
)


def _get_provider_chain() -> list[tuple[str, str]]:
    """Return ordered list of (api_key, model) tuples to try. Respects LLM_PROVIDER preference."""
    from app.config import (
        CEREBRAS_API_KEY,
        GROQ_API_KEY,
        GOOGLE_API_KEY,
        LLM_PROVIDER,
        MISTRAL_API_KEY,
        OPENROUTER_API_KEY,
    )

    providers = {
        "groq": (GROQ_API_KEY, "groq/llama-3.3-70b-versatile"),
        "openrouter": (OPENROUTER_API_KEY, "openrouter/meta-llama/llama-3.1-70b-instruct"),
        "mistral": (MISTRAL_API_KEY, "mistral/mistral-large-latest"),
        "cerebras": (CEREBRAS_API_KEY, "cerebras/llama-3.1-70b"),
        "google": (GOOGLE_API_KEY, "gemini/gemini-1.5-flash"),
        "gemini": (GOOGLE_API_KEY, "gemini/gemini-1.5-flash"),
    }

    chain: list[tuple[str, str]] = []
    preferred = (LLM_PROVIDER or "").strip().lower()

    # Add preferred provider first
    if preferred in providers:
        key, model = providers[preferred]
        if key:
            chain.append((key, model))

    # Add fallbacks in priority order
    fallback_order = ["groq", "openrouter", "google", "mistral", "cerebras"]
    for name in fallback_order:
        if name == preferred:
            continue
        key, model = providers.get(name, (None, ""))
        if key:
            chain.append((key, model))

    return chain


def _call_llm(api_key: str, model: str, messages: list[dict], max_tokens: int) -> str:
    """Single LLM call. Raises on failure."""
    import os
    import litellm

    # Set API key in env for LiteLLM
    if "groq" in model:
        os.environ["GROQ_API_KEY"] = api_key
    elif "openrouter" in model:
        os.environ["OPENROUTER_API_KEY"] = api_key
    elif "mistral" in model:
        os.environ["MISTRAL_API_KEY"] = api_key
    elif "cerebras" in model:
        os.environ["CEREBRAS_API_KEY"] = api_key
    elif "gemini" in model:
        os.environ["GOOGLE_API_KEY"] = api_key

    resp = litellm.completion(
        model=model,
        messages=messages,
        max_tokens=max_tokens,
        timeout=30,
    )
    choice = resp.choices[0] if resp.choices else None
    if choice and getattr(choice, "message", None):
        text = (choice.message.content or "").strip()
        if text:
            # Log token usage
            usage = getattr(resp, "usage", None)
            if usage:
                logger.info(
                    f"LLM [{model}] tokens: prompt={getattr(usage, 'prompt_tokens', '?')}, "
                    f"completion={getattr(usage, 'completion_tokens', '?')}, "
                    f"total={getattr(usage, 'total_tokens', '?')}"
                )
            return text
    raise ValueError("Empty LLM response")


def llm_complete(prompt: str, system: Optional[str] = None, max_tokens: int = 800) -> Optional[str]:
    """
    Call LLM with retry + fallback chain.
    Tries preferred provider first, then falls back through available providers.
    Each provider gets its own circuit breaker.
    Returns response text or None if all providers fail.
    """
    chain = _get_provider_chain()
    if not chain:
        logger.warning("No LLM provider configured. Set LLM_PROVIDER and API key in .env")
        return None

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    for api_key, model in chain:
        breaker = get_breaker(f"llm_{model}", failure_threshold=3, recovery_timeout=60.0)
        if not breaker.allow_request():
            logger.info(f"Skipping {model} — circuit breaker open")
            continue

        try:
            result = retry_with_backoff(
                _call_llm,
                api_key, model, messages, max_tokens,
                max_retries=2,
                base_delay=1.0,
                max_delay=5.0,
            )
            breaker.record_success()
            return result
        except Exception as e:
            breaker.record_failure()
            error_msg = str(e).lower()
            # Check for rate limiting
            if "rate" in error_msg or "429" in error_msg or "quota" in error_msg:
                logger.warning(f"Rate limited on {model}, trying next provider")
            else:
                logger.warning(f"Provider {model} failed: {type(e).__name__}: {e}")
            continue

    logger.error("All LLM providers exhausted. Returning None.")
    return None


def llm_root_cause_summary(question: str, findings_text: str, incidents_text: str) -> Optional[str]:
    """Synthesize 1-3 sentence root cause summary from findings and similar incidents."""
    # Sanitize user input to prevent prompt injection
    safe_question = sanitize_user_input(question, max_length=300)

    prompt = f"""Given this observability question and the following findings and similar past incidents, write a single short paragraph (2-4 sentences) summarizing the most likely root cause. Be specific and cite signals (e.g. logs, traces, deploy). If evidence is insufficient, say so briefly.

Question: {safe_question}

Findings (logs/traces/metrics):
{findings_text[:2500]}

Similar past incidents:
{incidents_text[:1500]}
"""
    return llm_complete(prompt, system="You are an SRE. Be concise and evidence-based.", max_tokens=300)
