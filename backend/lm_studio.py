import logging
import os
import time

import httpx

logger = logging.getLogger(__name__)

LM_STUDIO_URL: str = os.getenv("LM_STUDIO_URL", "http://localhost:1234/v1")
LM_STUDIO_CACHE_TTL: int = int(os.getenv("LM_STUDIO_CACHE_TTL", "30"))

_cached_models: set[str] = set()
_cache_timestamp: float = 0.0


async def _fetch_lm_studio_models() -> set[str]:
    """Fetch the list of loaded models from LM Studio, with TTL-based caching."""
    global _cached_models, _cache_timestamp

    now: float = time.monotonic()
    if _cached_models and (now - _cache_timestamp) < LM_STUDIO_CACHE_TTL:
        return _cached_models

    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(f"{LM_STUDIO_URL}/models")
            if response.status_code == 200:
                data = response.json()
                models = {m["id"] for m in data.get("data", [])}
                _cached_models = models
                _cache_timestamp = now
                logger.info("LM Studio models refreshed: %s", models)
                return models
    except (httpx.ConnectError, httpx.TimeoutException, httpx.RequestError):
        logger.debug("LM Studio not reachable at %s", LM_STUDIO_URL)
    except Exception:
        logger.debug("Unexpected error checking LM Studio", exc_info=True)

    # On failure, cache the empty result to avoid retrying every request
    _cached_models.clear()
    _cache_timestamp = now
    return _cached_models


async def resolve_client_params(
    model: str, base_url: str, api_key: str
) -> tuple[str, str]:
    """
    If the model is available in LM Studio, return LM Studio connection params.
    Otherwise return the original base_url and api_key unchanged.
    """
    if not model:
        return base_url, api_key

    available_models: set[str] = await _fetch_lm_studio_models()
    if model in available_models:
        logger.info("Routing model '%s' to LM Studio at %s", model, LM_STUDIO_URL)
        return LM_STUDIO_URL, "lm-studio"

    return base_url, api_key
