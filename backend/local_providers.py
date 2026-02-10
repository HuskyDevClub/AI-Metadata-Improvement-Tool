import logging
import os
import time

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Ollama
# ---------------------------------------------------------------------------
OLLAMA_HOST: str = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_CACHE_TTL: int = int(os.getenv("OLLAMA_CACHE_TTL", "30"))

_ollama_cached_models: set[str] = set()
_ollama_cache_ts: float = 0.0

# ---------------------------------------------------------------------------
# LM Studio
# ---------------------------------------------------------------------------
LM_STUDIO_URL: str = os.getenv("LM_STUDIO_URL", "http://localhost:1234/v1")
LM_STUDIO_CACHE_TTL: int = int(os.getenv("LM_STUDIO_CACHE_TTL", "30"))

_lm_studio_cached_models: set[str] = set()
_lm_studio_cache_ts: float = 0.0


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------
async def _fetch_models(
    base_url: str, api_key: str, cache: set[str], cache_ts: float, ttl: int, label: str
) -> tuple[set[str], float]:
    """Fetch model list via the OpenAI-compatible /v1/models endpoint.

    Returns (models, updated_cache_ts).
    """
    now = time.monotonic()
    if cache and (now - cache_ts) < ttl:
        return cache, cache_ts

    try:
        client = AsyncOpenAI(base_url=base_url, api_key=api_key, timeout=2.0)
        response = await client.models.list()
        models = {m.id for m in response.data if m.id}
        logger.info("%s models refreshed: %s", label, models)
        return models, now
    except Exception:
        logger.debug("%s not reachable at %s", label, base_url, exc_info=True)

    return set(), now


# ---------------------------------------------------------------------------
# Ollama public API
# ---------------------------------------------------------------------------
async def _fetch_ollama_models() -> set[str]:
    global _ollama_cached_models, _ollama_cache_ts
    models, ts = await _fetch_models(
        base_url=f"{OLLAMA_HOST}/v1",
        api_key="ollama",
        cache=_ollama_cached_models,
        cache_ts=_ollama_cache_ts,
        ttl=OLLAMA_CACHE_TTL,
        label="Ollama",
    )
    # Also register short names (e.g. "llama3.2" for "llama3.2:latest")
    expanded: set[str] = set(models)
    for name in models:
        if ":" in name:
            expanded.add(name.split(":")[0])
    _ollama_cached_models = expanded
    _ollama_cache_ts = ts
    return _ollama_cached_models


def _find_ollama_model(requested: str, available: set[str]) -> str | None:
    """Resolve an Ollama model name.

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
    """Return the resolved Ollama model name, or None if unavailable."""
    if not model:
        return None
    available = await _fetch_ollama_models()
    return _find_ollama_model(model, available)


# ---------------------------------------------------------------------------
# LM Studio public API
# ---------------------------------------------------------------------------
async def _fetch_lm_studio_models() -> set[str]:
    global _lm_studio_cached_models, _lm_studio_cache_ts
    models, ts = await _fetch_models(
        base_url=LM_STUDIO_URL,
        api_key="lm-studio",
        cache=_lm_studio_cached_models,
        cache_ts=_lm_studio_cache_ts,
        ttl=LM_STUDIO_CACHE_TTL,
        label="LM Studio",
    )
    _lm_studio_cached_models = models
    _lm_studio_cache_ts = ts
    return _lm_studio_cached_models


async def resolve_client_params(
    model: str, base_url: str, api_key: str
) -> tuple[str, str]:
    """If the model is loaded in LM Studio, return its connection params.

    Otherwise return the original base_url and api_key unchanged.
    """
    if not model:
        return base_url, api_key

    available = await _fetch_lm_studio_models()
    if model in available:
        logger.info("Routing model '%s' to LM Studio at %s", model, LM_STUDIO_URL)
        return LM_STUDIO_URL, "lm-studio"

    return base_url, api_key
