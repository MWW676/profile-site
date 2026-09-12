import time
import logging
from google.genai.errors import ServerError

logger = logging.getLogger("uvicorn.error")


def call_with_retry(fn, *args, max_attempts: int = 3, base_delay: float = 2.0, **kwargs):
    """Call fn(*args, **kwargs), retrying on transient Gemini server errors (5xx)
    with exponential backoff. Defaults (3 attempts, 2s base) suit background/
    batch work; pass max_attempts=2, base_delay=1.0 for latency-sensitive,
    user-facing calls."""
    last_error = None
    for attempt in range(1, max_attempts + 1):
        try:
            return fn(*args, **kwargs)
        except ServerError as e:
            last_error = e
            if attempt == max_attempts:
                break
            delay = base_delay * (2 ** (attempt - 1))
            logger.warning(f"Gemini server error (attempt {attempt}/{max_attempts}), retrying in {delay}s: {e}")
            time.sleep(delay)
    raise last_error
