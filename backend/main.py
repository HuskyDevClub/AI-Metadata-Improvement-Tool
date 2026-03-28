import asyncio
import json
import logging
import os
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

logger = logging.getLogger(__name__)

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from openai import APIStatusError, AsyncOpenAI
from openai.types.chat import ChatCompletionMessageParam
from openai.types.shared_params.response_format_json_schema import JSONSchema

from .local_providers import (
    HF_API_KEY,
    HF_API_URL,
    LM_STUDIO_URL,
    OLLAMA_HOST,
    is_huggingface_available,
    is_lm_studio_available,
    is_ollama_available,
)
from .models import (
    DEFAULT_SCORING_CATEGORIES,
    ChatRequest,
    FetchCsvRequest,
    FetchCsvResponse,
    HealthResponse,
    JudgeMetrics,
    JudgeRequest,
    JudgeResponse,
    ScoringCategory,
    SocrataColumnMetadata,
    SocrataExportRequest,
    SocrataExportResponse,
    SocrataImportRequest,
    SocrataImportResponse,
    SocrataOAuthLoginResponse,
    SocrataOAuthUserInfo,
)

# Load environment variables from .env file
load_dotenv()

# Configuration
SOCRATA_APP_TOKEN = os.getenv("SOCRATA_APP_TOKEN", "")
SOCRATA_API_KEY_ID = os.getenv("SOCRATA_API_KEY_ID", "")
SOCRATA_API_KEY_SECRET = os.getenv("SOCRATA_API_KEY_SECRET", "")
SOCRATA_OAUTH_CLIENT_ID = os.getenv("SOCRATA_OAUTH_CLIENT_ID", "")
SOCRATA_OAUTH_CLIENT_SECRET = os.getenv("SOCRATA_OAUTH_CLIENT_SECRET", "")
SOCRATA_OAUTH_REDIRECT_URI = os.getenv(
    "SOCRATA_OAUTH_REDIRECT_URI",
    "http://localhost:8000/api/auth/socrata/callback",
)
FRONTEND_URL = os.getenv("FRONTEND_URL", "")
AZURE_ENDPOINT = os.getenv("AZURE_ENDPOINT", "")
AZURE_KEY = os.getenv("AZURE_KEY", "")
AZURE_MODEL = os.getenv("AZURE_MODEL", "")
CORS_ORIGIN = os.getenv("CORS_ORIGIN", "*")

# For Databricks Apps, the port is typically provided via environment variable
PORT = int(os.getenv("PORT", "8000"))


app = FastAPI(
    title="AI Metadata Improvement Tool API",
    description="Backend API for metadata improvement using AI",
    version="1.0.0",
)

# CORS middleware - more permissive for Databricks Apps
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Databricks Apps handles auth
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Health check endpoint
@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return HealthResponse(
        status="ok",
        timestamp=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    )


# CSV fetch endpoint
@app.post("/api/csv/fetch", response_model=FetchCsvResponse)
async def fetch_csv(request: FetchCsvRequest) -> FetchCsvResponse:
    if not request.url:
        raise HTTPException(status_code=400, detail="URL is required")

    # check if a Socrata token is provided in the request, otherwise use the environment variable
    token = request.socrataToken or SOCRATA_APP_TOKEN
    if not token:
        raise HTTPException(
            status_code=400,
            detail="Socrata API token is required. Provide it in the UI or set SOCRATA_APP_TOKEN in the environment.",
        )

    headers: dict[str, str] = {
        "Accept": "text/csv",
        "X-App-Token": token,
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(request.url, headers=headers)

            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Failed to fetch CSV: {response.reason_phrase}",
                )

            csv_text = response.text
            file_name = request.url.split("/")[-1] or "remote-data.csv"

            return FetchCsvResponse(csvText=csv_text, fileName=file_name)

    except httpx.RequestError as e:
        logger.exception("CSV fetch request error: %s, reason: %s", request.url, str(e))
        raise HTTPException(status_code=500, detail=f"Failed to fetch CSV: {str(e)}")


# Socrata OAuth endpoints
@app.get("/api/auth/socrata/login", response_model=SocrataOAuthLoginResponse)
async def socrata_oauth_login() -> SocrataOAuthLoginResponse:
    """Return the OAuth authorization URL for data.wa.gov sign-in."""
    if not SOCRATA_OAUTH_CLIENT_ID:
        raise HTTPException(
            status_code=400,
            detail="OAuth not configured. Set SOCRATA_OAUTH_CLIENT_ID in the environment.",
        )
    params = urlencode(
        {
            "client_id": SOCRATA_OAUTH_CLIENT_ID,
            "response_type": "code",
            "redirect_uri": SOCRATA_OAUTH_REDIRECT_URI,
        }
    )
    auth_url = f"https://data.wa.gov/oauth/authorize?{params}"
    return SocrataOAuthLoginResponse(authUrl=auth_url)


@app.get("/api/auth/socrata/callback")
async def socrata_oauth_callback(code: str | None = None, error: str | None = None):
    """OAuth callback — exchanges authorization code for access token, redirects to frontend."""
    base = FRONTEND_URL.rstrip("/") if FRONTEND_URL else ""

    if error:
        return RedirectResponse(url=f"{base}/#oauth_error={error}")

    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    if not SOCRATA_OAUTH_CLIENT_ID or not SOCRATA_OAUTH_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="OAuth not configured on server")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            token_resp = await client.post(
                "https://data.wa.gov/oauth/access_token",
                data={
                    "client_id": SOCRATA_OAUTH_CLIENT_ID,
                    "client_secret": SOCRATA_OAUTH_CLIENT_SECRET,
                    "grant_type": "authorization_code",
                    "redirect_uri": SOCRATA_OAUTH_REDIRECT_URI,
                    "code": code,
                },
            )

            if token_resp.status_code != 200:
                logger.error("OAuth token exchange failed: %s", token_resp.text)
                return RedirectResponse(
                    url=f"{base}/#oauth_error=token_exchange_failed"
                )

            token_data = token_resp.json()
            access_token = token_data.get("access_token")

            if not access_token:
                return RedirectResponse(url=f"{base}/#oauth_error=no_access_token")

            return RedirectResponse(url=f"{base}/#oauth_token={access_token}")

    except Exception as e:
        logger.exception("OAuth callback error: %s", str(e))
        return RedirectResponse(url=f"{base}/#oauth_error=server_error")


@app.post("/api/auth/socrata/userinfo", response_model=SocrataOAuthUserInfo)
async def socrata_oauth_userinfo(request: Request) -> SocrataOAuthUserInfo:
    """Fetch the current authenticated user's info from data.wa.gov."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("OAuth "):
        raise HTTPException(status_code=401, detail="Missing OAuth token")

    token = auth_header[6:]

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                "https://data.wa.gov/api/users/current.json",
                headers={"Authorization": f"OAuth {token}"},
            )

            if resp.status_code != 200:
                raise HTTPException(
                    status_code=401, detail="Invalid or expired OAuth token"
                )

            user_data = resp.json()
            return SocrataOAuthUserInfo(
                id=user_data.get("id", ""),
                displayName=user_data.get("displayName", ""),
                email=user_data.get("email"),
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("OAuth userinfo error: %s", str(e))
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch user info: {str(e)}"
        )


# Socrata import endpoint — fetches metadata + CSV in one request
@app.post("/api/socrata/import", response_model=SocrataImportResponse)
async def socrata_import(request: SocrataImportRequest) -> SocrataImportResponse:
    if not request.datasetId or not request.datasetId.strip():
        raise HTTPException(status_code=400, detail="Dataset ID is required")

    dataset_id = request.datasetId.strip()

    # Build auth headers — OAuth token takes precedence over API keys
    headers: dict[str, str] = {}
    auth = None

    if request.oauthToken:
        headers["Authorization"] = f"OAuth {request.oauthToken}"
    else:
        token = request.appToken or SOCRATA_APP_TOKEN
        if token:
            headers["X-App-Token"] = token

        # HTTP Basic Auth for private datasets (request overrides env vars)
        key_id = request.apiKeyId or SOCRATA_API_KEY_ID
        key_secret = request.apiKeySecret or SOCRATA_API_KEY_SECRET
        if key_id and key_secret:
            auth = (key_id, key_secret)

    metadata_url = f"https://data.wa.gov/api/views/{dataset_id}.json"
    csv_url = f"https://data.wa.gov/api/views/{dataset_id}/rows.csv?accessType=DOWNLOAD"

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            # Fetch metadata and CSV in parallel
            metadata_resp, csv_resp = await asyncio.gather(
                client.get(metadata_url, headers=headers, auth=auth),
                client.get(csv_url, headers=headers, auth=auth),
            )

            if metadata_resp.status_code != 200:
                raise HTTPException(
                    status_code=metadata_resp.status_code,
                    detail=f"Failed to fetch dataset metadata: {metadata_resp.reason_phrase}",
                )

            if csv_resp.status_code != 200:
                raise HTTPException(
                    status_code=csv_resp.status_code,
                    detail=f"Failed to fetch CSV data: {csv_resp.reason_phrase}",
                )

            metadata = metadata_resp.json()

            # Extract dataset-level info (use `or` to coalesce null values)
            dataset_name = metadata.get("name") or dataset_id
            dataset_description = metadata.get("description") or ""

            # Extract column metadata
            columns: list[SocrataColumnMetadata] = []
            for col in metadata.get("columns", []):
                columns.append(
                    SocrataColumnMetadata(
                        fieldName=col.get("fieldName") or "",
                        name=col.get("name") or "",
                        description=col.get("description") or "",
                        dataTypeName=col.get("dataTypeName") or "",
                    )
                )

            return SocrataImportResponse(
                csvText=csv_resp.text,
                fileName=f"{dataset_name}.csv",
                datasetName=dataset_name,
                datasetDescription=dataset_description,
                columns=columns,
            )

    except Exception as e:
        logger.exception("Socrata import error: %s", str(e))
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch from data.wa.gov: {str(e)}"
        )


# Socrata export endpoint — pushes updated metadata back to data.wa.gov
@app.post("/api/socrata/export", response_model=SocrataExportResponse)
async def socrata_export(request: SocrataExportRequest) -> SocrataExportResponse:
    if not request.datasetId or not request.datasetId.strip():
        raise HTTPException(status_code=400, detail="Dataset ID is required")

    dataset_id = request.datasetId.strip()

    # Build auth — write operations require OAuth token or API Key
    headers: dict[str, str] = {"Content-Type": "application/json"}
    auth = None

    if request.oauthToken:
        headers["Authorization"] = f"OAuth {request.oauthToken}"
    else:
        key_id = request.apiKeyId or SOCRATA_API_KEY_ID
        key_secret = request.apiKeySecret or SOCRATA_API_KEY_SECRET
        if not key_id or not key_secret:
            raise HTTPException(
                status_code=400,
                detail="Authentication required to update metadata on data.wa.gov. "
                "Sign in with OAuth or provide API Key ID and Secret.",
            )
        auth = (key_id, key_secret)

        token = request.appToken or SOCRATA_APP_TOKEN
        if token:
            headers["X-App-Token"] = token

    metadata_url = f"https://data.wa.gov/api/views/{dataset_id}.json"

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            # 1. Fetch current metadata to get column IDs
            meta_resp = await client.get(metadata_url, headers=headers, auth=auth)
            if meta_resp.status_code != 200:
                raise HTTPException(
                    status_code=meta_resp.status_code,
                    detail=f"Failed to fetch current metadata: {meta_resp.reason_phrase}",
                )
            current_metadata = meta_resp.json()

            # 2. Build update payload — only touch description fields
            update_payload: dict[str, Any] = {}

            if request.datasetDescription is not None:
                update_payload["description"] = request.datasetDescription

            # Merge column description updates into existing columns
            updated_col_count = 0
            if request.columns:
                field_desc_map = {c.fieldName: c.description for c in request.columns}
                updated_columns = []
                for col in current_metadata.get("columns", []):
                    field_name = col.get("fieldName", "")
                    if field_name in field_desc_map:
                        col["description"] = field_desc_map[field_name]
                        updated_col_count += 1
                    updated_columns.append(col)
                update_payload["columns"] = updated_columns

            if not update_payload:
                return SocrataExportResponse(
                    success=True,
                    message="No changes to push.",
                    updatedColumns=0,
                )

            # 3. PUT updated metadata back to Socrata
            put_resp = await client.put(
                metadata_url,
                headers=headers,
                auth=auth,  # type: ignore[arg-type]
                json=update_payload,
            )

            if put_resp.status_code not in (200, 202):
                error_detail = (
                    put_resp.text[:500] if put_resp.text else put_resp.reason_phrase
                )
                raise HTTPException(
                    status_code=put_resp.status_code,
                    detail=f"Failed to update metadata on data.wa.gov: {error_detail}",
                )

            parts = []
            if request.datasetDescription is not None:
                parts.append("dataset description")
            if updated_col_count > 0:
                parts.append(
                    f"{updated_col_count} column description{'s' if updated_col_count != 1 else ''}"
                )
            message = f"Successfully updated {' and '.join(parts)} on data.wa.gov."

            return SocrataExportResponse(
                success=True,
                message=message,
                updatedColumns=updated_col_count,
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Socrata export error: %s", str(e))
        raise HTTPException(
            status_code=500, detail=f"Failed to push metadata to data.wa.gov: {str(e)}"
        )


class Provider(Enum):
    OLLAMA = "ollama"
    LM_STUDIO = "lm_studio"
    HUGGINGFACE = "huggingface"
    AZURE = "azure"


async def resolve_provider(
    model: str, base_url: str, api_key: str
) -> tuple[Provider, str, str, str]:
    """
    Resolve which provider to use for a given model.

    Fallback chain: Ollama -> LM Studio -> HuggingFace -> Azure (original params).

    Returns: (provider, resolved_model, base_url, api_key)
    """
    if not model:
        return Provider.AZURE, model, base_url, api_key

    # 1. Check Ollama first (use its OpenAI-compatible endpoint)
    ollama_model = await is_ollama_available(model)
    if ollama_model is not None:
        return Provider.OLLAMA, ollama_model, f"{OLLAMA_HOST}/v1", "ollama"

    # 2. Check LM Studio
    if await is_lm_studio_available(model):
        return Provider.LM_STUDIO, model, LM_STUDIO_URL, "lm-studio"

    # 3. Check HuggingFace Router
    if await is_huggingface_available(model):
        return Provider.HUGGINGFACE, model, HF_API_URL, HF_API_KEY

    # 4. Fall back to Azure
    return Provider.AZURE, model, base_url, api_key


# OpenAI streaming chat endpoint
@app.post("/api/openai/chat/stream")
async def openai_chat_stream(
    request: ChatRequest, http_request: Request
) -> StreamingResponse:
    # Get configuration from the request or environment
    base_url = request.baseURL or AZURE_ENDPOINT
    api_key = request.apiKey or AZURE_KEY
    model = request.model or AZURE_MODEL

    # Resolve provider: Ollama -> LM Studio -> OpenAI/Azure
    provider, resolved_model, base_url, api_key = await resolve_provider(
        model, base_url, api_key
    )

    # Validate configuration (only needed for Azure — local/HF providers are self-contained)
    if provider == Provider.AZURE:
        missing_config = []
        if not base_url:
            missing_config.append("Base URL (AZURE_ENDPOINT)")
        if not api_key:
            missing_config.append("API Key (AZURE_KEY)")
        if not resolved_model:
            missing_config.append("Model (AZURE_MODEL)")

        if missing_config:
            raise HTTPException(
                status_code=400,
                detail=f"Missing required configuration: {', '.join(missing_config)}. "
                "Please set these in the environment or enter them in the UI.",
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
                model=resolved_model,
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


def build_judge_schema(
    categories: list[ScoringCategory], model_count: int
) -> JSONSchema:
    """Build a JSON schema for the judge response based on scoring categories and N models."""
    metric_props: dict[str, Any] = {}
    metric_required: list[str] = []
    for cat in categories:
        metric_props[cat.key] = {"type": "integer"}
        metric_required.append(cat.key)
    metric_props["reasoning"] = {"type": "string"}
    metric_required.append("reasoning")

    model_schema: dict[str, Any] = {
        "type": "object",
        "additionalProperties": False,
        "properties": metric_props,
        "required": metric_required,
    }

    # Build model properties: model1, model2, ..., modelN
    properties: dict[str, dict[str, Any]] = {}
    required: list[str] = []
    for i in range(model_count):
        key = f"model{i + 1}"
        properties[key] = model_schema
        required.append(key)

    # Winner enum: "1", "2", ..., "N", "tie"
    winner_enum = [str(i + 1) for i in range(model_count)] + ["tie"]
    properties["winner"] = {"type": "string", "enum": winner_enum}
    required.append("winner")
    properties["winnerReasoning"] = {"type": "string"}
    required.append("winnerReasoning")

    return {
        "name": "judge_response",
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": properties,
            "required": required,
        },
        "strict": True,
    }


@app.post("/api/openai/judge", response_model=JudgeResponse)
async def judge_outputs(request: JudgeRequest) -> JudgeResponse:
    """Evaluate N model outputs and return structured metrics."""
    # Get configuration from the request or environment
    base_url = request.baseURL or AZURE_ENDPOINT
    api_key = request.apiKey or AZURE_KEY
    model = request.model or AZURE_MODEL

    # Resolve provider: Ollama -> LM Studio -> OpenAI/Azure
    provider, resolved_model, base_url, api_key = await resolve_provider(
        model, base_url, api_key
    )

    # Validate configuration (only needed for Azure)
    if provider == Provider.AZURE:
        missing_config = []
        if not base_url:
            missing_config.append("Base URL (AZURE_ENDPOINT)")
        if not api_key:
            missing_config.append("API Key (AZURE_KEY)")
        if not resolved_model:
            missing_config.append("Model (AZURE_MODEL)")

        if missing_config:
            raise HTTPException(
                status_code=400,
                detail=f"Missing required configuration: {', '.join(missing_config)}. "
                "Please set these in the environment or enter them in the UI.",
            )

    if not request.judgeEvaluationPrompt or not request.judgeEvaluationPrompt.strip():
        raise HTTPException(
            status_code=400,
            detail="judgeEvaluationPrompt is required and cannot be empty.",
        )

    model_count = len(request.outputs)

    if model_count < 2:
        raise HTTPException(
            status_code=400,
            detail="At least 2 outputs are required for judging.",
        )

    # Resolve scoring categories
    categories = request.scoringCategories or DEFAULT_SCORING_CATEGORIES
    category_keys = [cat.key for cat in categories]

    # Substitute output placeholders: {output_0}, {output_1}, ...
    user_prompt = request.judgeEvaluationPrompt.replace("{context}", request.context)
    for i, output in enumerate(request.outputs):
        user_prompt = user_prompt.replace(f"{{output_{i}}}", output)

    # Build messages array, only include system prompt if provided
    messages: list[ChatCompletionMessageParam] = []
    if request.judgeSystemPrompt and request.judgeSystemPrompt.strip():
        messages.append({"role": "system", "content": request.judgeSystemPrompt})
    messages.append({"role": "user", "content": user_prompt})

    # Build dynamic schema from categories and model count
    judge_schema = build_judge_schema(categories, model_count)

    try:
        # Shared path for all providers (OpenAI / LM Studio / Ollama via AsyncOpenAI)
        client = AsyncOpenAI(
            base_url=base_url,
            api_key=api_key,
        )

        response = await client.chat.completions.create(
            model=resolved_model,
            messages=messages,
            response_format={
                "type": "json_schema",
                "json_schema": judge_schema,
            },
        )

        content = response.choices[0].message.content
        if not content:
            raise HTTPException(
                status_code=500, detail="Empty response from judge model"
            )

        result = json.loads(content)

        usage = {
            "promptTokens": response.usage.prompt_tokens if response.usage else 0,
            "completionTokens": (
                response.usage.completion_tokens if response.usage else 0
            ),
            "totalTokens": response.usage.total_tokens if response.usage else 0,
        }

        # Parse N model results (shared for all providers)
        models_metrics: list[JudgeMetrics] = [
            JudgeMetrics.from_dict(result[f"model{i + 1}"], category_keys)
            for i in range(model_count)
        ]

        # Parse winner: "1", "2", ..., "N" -> 0-based index, "tie" -> None
        winner_str = result["winner"]
        winner_index = None if winner_str == "tie" else int(winner_str) - 1

        return JudgeResponse(
            models=models_metrics,
            winnerIndex=winner_index,
            winnerReasoning=result["winnerReasoning"],
            usage=usage,
        )

    except json.JSONDecodeError as e:
        logger.exception("Failed to parse judge response")
        raise HTTPException(
            status_code=500, detail=f"Failed to parse judge response: {str(e)}"
        )
    except KeyError as e:
        logger.exception("Invalid judge response structure")
        raise HTTPException(
            status_code=500,
            detail=f"Invalid judge response structure: missing {str(e)}",
        )
    except Exception as e:
        logger.exception("Judge evaluation failed")
        raise HTTPException(
            status_code=500, detail=f"Judge evaluation failed: {str(e)}"
        )


# Serve static files (React frontend) - must be last
# In Databricks Apps, static files are served from the 'static' directory
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static_assets")

    # Root route - serve index.html
    @app.get("/")
    async def serve_root() -> FileResponse:
        index_path = static_dir / "index.html"
        if index_path.exists():
            return FileResponse(index_path)
        raise HTTPException(status_code=404, detail="Frontend not built")

    # Serve index.html for all non-API routes (SPA support)
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str) -> FileResponse:
        # Don't interfere with API routes
        if full_path.startswith("api/") or full_path == "health":
            raise HTTPException(status_code=404, detail="Not found")

        # Try to serve the exact file first
        file_path = static_dir / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)

        # Fall back to index.html for SPA routing
        index_path = static_dir / "index.html"
        if index_path.exists():
            return FileResponse(index_path)

        raise HTTPException(status_code=404, detail="Not found")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
