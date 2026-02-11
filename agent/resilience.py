"""
Resilience utilities: retry with exponential backoff, circuit breaker, structured logging.
Production-grade error handling for Elasticsearch and LLM calls.
"""
import functools
import logging
import time
from typing import Any, Callable, Optional, TypeVar

T = TypeVar("T")

# ── Structured logger ──
logger = logging.getLogger("observability_copilot")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s.%(funcName)s: %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    ))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


class CircuitOpen(Exception):
    """Raised when circuit breaker is open."""
    pass


class CircuitBreaker:
    """
    Simple circuit breaker: after `failure_threshold` consecutive failures,
    opens the circuit for `recovery_timeout` seconds. Half-open lets one request through.
    """

    def __init__(self, name: str, failure_threshold: int = 3, recovery_timeout: float = 30.0):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self._failures = 0
        self._last_failure: float = 0.0
        self._state = "closed"  # closed | open | half-open

    @property
    def state(self) -> str:
        if self._state == "open":
            if time.time() - self._last_failure > self.recovery_timeout:
                self._state = "half-open"
        return self._state

    def record_success(self) -> None:
        self._failures = 0
        self._state = "closed"

    def record_failure(self) -> None:
        self._failures += 1
        self._last_failure = time.time()
        if self._failures >= self.failure_threshold:
            self._state = "open"
            logger.warning(f"Circuit breaker '{self.name}' OPEN after {self._failures} failures")

    def allow_request(self) -> bool:
        s = self.state
        if s == "closed":
            return True
        if s == "half-open":
            return True  # allow one probe
        return False


# ── Global circuit breakers ──
_breakers: dict[str, CircuitBreaker] = {}


def get_breaker(name: str, failure_threshold: int = 3, recovery_timeout: float = 30.0) -> CircuitBreaker:
    if name not in _breakers:
        _breakers[name] = CircuitBreaker(name, failure_threshold, recovery_timeout)
    return _breakers[name]


def retry_with_backoff(
    func: Callable[..., T],
    *args: Any,
    max_retries: int = 3,
    base_delay: float = 0.5,
    max_delay: float = 10.0,
    breaker_name: Optional[str] = None,
    fallback: Optional[Callable[..., T]] = None,
    **kwargs: Any,
) -> T:
    """
    Execute `func` with exponential backoff retry.
    If `breaker_name` is given, checks circuit breaker before each attempt.
    If all retries fail and `fallback` is given, calls fallback.
    """
    breaker = get_breaker(breaker_name) if breaker_name else None
    last_exc: Optional[Exception] = None

    for attempt in range(max_retries):
        if breaker and not breaker.allow_request():
            logger.warning(f"Circuit '{breaker_name}' is open, skipping attempt {attempt + 1}")
            if fallback:
                return fallback(*args, **kwargs)
            raise CircuitOpen(f"Circuit breaker '{breaker_name}' is open")

        try:
            result = func(*args, **kwargs)
            if breaker:
                breaker.record_success()
            return result
        except Exception as e:
            last_exc = e
            if breaker:
                breaker.record_failure()
            delay = min(base_delay * (2 ** attempt), max_delay)
            logger.warning(
                f"Retry {attempt + 1}/{max_retries} for {func.__name__}: {type(e).__name__}: {e}. "
                f"Retrying in {delay:.1f}s"
            )
            if attempt < max_retries - 1:
                time.sleep(delay)

    logger.error(f"All {max_retries} retries exhausted for {func.__name__}: {last_exc}")
    if fallback:
        logger.info(f"Using fallback for {func.__name__}")
        return fallback(*args, **kwargs)
    raise last_exc  # type: ignore


def sanitize_user_input(text: str, max_length: int = 1000) -> str:
    """
    Sanitize user input for LLM prompts — prevent prompt injection.
    Strips control characters, limits length, escapes common injection patterns.
    """
    if not text:
        return ""
    # Remove control characters except newline/tab
    cleaned = "".join(c for c in text if c.isprintable() or c in ("\n", "\t"))
    # Truncate
    cleaned = cleaned[:max_length]
    # Escape common prompt injection patterns
    injection_patterns = [
        "ignore previous instructions",
        "ignore all instructions",
        "disregard above",
        "system prompt",
        "you are now",
        "act as",
    ]
    lowered = cleaned.lower()
    for pattern in injection_patterns:
        if pattern in lowered:
            logger.warning(f"Potential prompt injection detected: '{pattern}' in input")
            # Don't block, but wrap in context
            cleaned = f"[USER QUERY] {cleaned} [/USER QUERY]"
            break
    return cleaned.strip()
