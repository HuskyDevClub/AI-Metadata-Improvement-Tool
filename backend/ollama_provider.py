import logging
import os
import time

import httpx

logger = logging.getLogger(__name__)

# Ollama API host URL, defaulting to http://localhost:11434
OLLAMA_HOST: str = os.getenv("OLLAMA_HOST", "http://localhost:11434")

# Cache TTL for the Ollama model list in seconds. Default is 30 seconds.
OLLAMA_CACHE_TTL: int = int(os.getenv("OLLAMA_CACHE_TTL", "30"))

# Internal cache for Ollama models and last fetch timestamp
_cached_models: set[str] = set()

# Timestamp of the last successful fetch of Ollama models (monotonic time)
_cache_timestamp: float = 0.0


async def _fetch_ollama_models() -> set[str]:
    """Fetch installed Ollama models with TTL-based caching."""
    global _cached_models, _cache_timestamp

    now: float = time.monotonic()
    if _cached_models and (now - _cache_timestamp) < OLLAMA_CACHE_TTL:
        return _cached_models

    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(f"{OLLAMA_HOST}/api/tags")
            if response.status_code == 200:
                data = response.json()
                models: set[str] = set()
                for m in data.get("models", []):
                    name = m.get("name", "")
                    if not name:
                        continue
                    models.add(name)  # e.g. "llama3.2:latest"
                    if ":" in name:
                        models.add(name.split(":")[0])  # e.g. "llama3.2"
                _cached_models = models
                _cache_timestamp = now
                logger.info("Ollama models refreshed: %s", models)
                return models
    except (httpx.ConnectError, httpx.TimeoutException, httpx.RequestError):
        logger.debug("Ollama not reachable at %s", OLLAMA_HOST)
    except Exception:
        logger.debug("Unexpected error checking Ollama", exc_info=True)

    _cached_models.clear()
    _cache_timestamp = now
    return _cached_models


def _find_ollama_model(requested: str, available: set[str]) -> str | None:
    """
    Find a matching Ollama model name.
    Returns the resolved model name or None.
    Priority: exact match > requested:latest > prefix match.
    """
    if requested in available:
        return requested
    if f"{requested}:latest" in available:
        return f"{requested}:latest"
    for model in available:
        if model.startswith(requested + ":"):
            return model
    return None


async def is_ollama_available(model: str) -> str | None:
    """
    Check if the requested model is available in Ollama.
    Returns the resolved model name if available, None otherwise.
    """
    if not model:
        return None
    available = await _fetch_ollama_models()
    return _find_ollama_model(model, available)
