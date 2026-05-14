import json
import logging
from collections.abc import AsyncGenerator

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from openai import APIStatusError, AsyncOpenAI
from openai.types.chat import ChatCompletionMessageParam

from .auth import read_session
from .config import (
    LLM_API_KEY,
    LLM_ENDPOINT,
    LLM_MODEL,
    LLM_MODEL_CONCISE,
    LLM_MODEL_DETAILED,
    LLM_MODEL_SUGGEST,
)
from .models import ChatRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/openai")


@router.post("/chat/stream")
async def openai_chat_stream(
    request: ChatRequest, http_request: Request
) -> StreamingResponse:
    # Resolve configuration in tiers, binding credentials and model to the SAME
    # source so the server's LLM_API_KEY can never be paired with an arbitrary
    # user-chosen model or upstream endpoint:
    #   Tier 1 — request body (user supplied apiKey inline this call)
    #   Tier 2 — encrypted session cookie (user previously saved their config)
    #   Tier 3 — server environment defaults (LLM_* vars)
    session = read_session(http_request)
    config = session.get("openai_config") or {}

    req_base_url = (request.baseURL or "").strip()
    req_api_key = (request.apiKey or "").strip()
    req_model = (request.model or "").strip()

    cfg_base_url = (config.get("baseURL") or "").strip()
    cfg_api_key = (config.get("apiKey") or "").strip()
    cfg_model = (config.get("model") or "").strip()
    cfg_mode_model = {
        "concise": (config.get("modelConcise") or "").strip(),
        "detailed": (config.get("modelDetailed") or "").strip(),
        "suggest": (config.get("modelSuggest") or "").strip(),
    }.get(request.mode or "", "")

    env_mode_model = {
        "concise": LLM_MODEL_CONCISE,
        "detailed": LLM_MODEL_DETAILED,
        "suggest": LLM_MODEL_SUGGEST,
    }.get(request.mode or "", "")

    if req_api_key:
        if not req_base_url:
            raise HTTPException(
                status_code=400,
                detail="To use a custom API Key, you must also provide a Base URL.",
            )
        base_url = req_base_url
        api_key = req_api_key
        model = req_model or cfg_mode_model or cfg_model
    elif cfg_api_key:
        base_url = req_base_url or cfg_base_url
        api_key = cfg_api_key
        model = req_model or cfg_mode_model or cfg_model
    else:
        # Server defaults only — reject any attempt to override model or baseURL,
        # so the server's API key is always paired with the server's configured
        # endpoint and model.
        if req_model or req_base_url or cfg_model or cfg_base_url:
            raise HTTPException(
                status_code=400,
                detail="To use a custom model or Base URL, you must also configure "
                "your own API Key in Settings.",
            )
        base_url = LLM_ENDPOINT
        api_key = LLM_API_KEY
        model = env_mode_model or LLM_MODEL

    # Validate configuration
    missing_config = []
    if not base_url:
        missing_config.append("Base URL")
    if not api_key:
        missing_config.append("API Key")
    if not model:
        missing_config.append("Model")

    if missing_config:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required configuration: {', '.join(missing_config)}. "
            "Please enter them in the Settings page.",
        )

    # Build messages array, only include system prompt if provided
    messages: list[ChatCompletionMessageParam] = []
    if request.systemPrompt and request.systemPrompt.strip():
        messages.append({"role": "system", "content": request.systemPrompt})
    messages.append({"role": "user", "content": request.prompt})

    # Shared path for all providers (OpenAI / LM Studio / Ollama via AsyncOpenAI)
    async def generate() -> AsyncGenerator[str, None]:
        usage: dict[str, int] = {
            "promptTokens": 0,
            "completionTokens": 0,
            "totalTokens": 0,
        }

        try:
            client = AsyncOpenAI(
                base_url=base_url,
                api_key=api_key,
            )

            stream = await client.chat.completions.create(
                model=model,
                messages=messages,
                stream=True,
                stream_options={"include_usage": True},
            )

            async for chunk in stream:
                # Check if the client disconnected
                if await http_request.is_disconnected():
                    break

                if chunk.choices and chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    yield f"data: {json.dumps({'type': 'content', 'content': content})}\n\n"

                if chunk.usage:
                    usage["promptTokens"] = chunk.usage.prompt_tokens or 0
                    usage["completionTokens"] = chunk.usage.completion_tokens or 0
                    usage["totalTokens"] = chunk.usage.total_tokens or 0

            # Send final usage data
            yield f"data: {json.dumps({'type': 'usage', 'usage': usage})}\n\n"
            yield "data: [DONE]\n\n"

        except Exception as e:
            logger.exception("Streaming chat error")
            if isinstance(e, APIStatusError):
                error_message = f"API error ({e.status_code}): {e.message}"
            else:
                error_message = str(e)
            yield f"data: {json.dumps({'type': 'error', 'error': error_message})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
