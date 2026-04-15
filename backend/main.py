import asyncio
import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import time
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
    ColumnStats,
    DatasetValidationRequest,
    FetchCsvRequest,
    FetchCsvResponse,
    HealthResponse,
    JudgeMetrics,
    JudgeRequest,
    JudgeResponse,
    PairwiseComparison,
    ScoringCategory,
    SocrataColumnMetadata,
    SocrataExportRequest,
    SocrataExportResponse,
    SocrataImportRequest,
    SocrataImportResponse,
    SocrataOAuthLoginResponse,
    SocrataOAuthUserInfo,
    ValidationResult,
)
from .validation import ValidationEngine, ValidationResult

# Load environment variables from .env file
load_dotenv()

# Configuration
SOCRATA_APP_TOKEN = os.getenv("SOCRATA_APP_TOKEN", "")
SOCRATA_SECRET_TOKEN = os.getenv("SOCRATA_SECRET_TOKEN", "")
SOCRATA_OAUTH_REDIRECT_URI = os.getenv(
    "SOCRATA_OAUTH_REDIRECT_URI",
    "http://localhost:8000/api/auth/socrata/callback",
)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
AZURE_ENDPOINT = os.getenv("AZURE_ENDPOINT", "")
AZURE_KEY = os.getenv("AZURE_KEY", "")
AZURE_MODEL = os.getenv("AZURE_MODEL", "")
CORS_ORIGIN = os.getenv("CORS_ORIGIN", "*")
# Secret for signing OAuth state tokens (used to prevent CSRF)
_OAUTH_STATE_SECRET = (
    os.getenv("OAUTH_STATE_SECRET") or SOCRATA_SECRET_TOKEN or secrets.token_hex(32)
)

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

    if not SOCRATA_APP_TOKEN:
        raise HTTPException(
            status_code=500,
            detail="SOCRATA_APP_TOKEN is not configured on the server.",
        )

    headers: dict[str, str] = {
        "Accept": "text/csv",
        "X-App-Token": SOCRATA_APP_TOKEN,
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
    if not SOCRATA_APP_TOKEN:
        raise HTTPException(
            status_code=400,
            detail="OAuth not configured. Set SOCRATA_APP_TOKEN in the environment.",
        )
    # Signed state token: random_part.signature.timestamp (no cookies needed)
    random_bytes = secrets.token_bytes(16)
    timestamp = str(int(time.time()))
    sig = hmac.new(
        _OAUTH_STATE_SECRET.encode(),
        random_bytes + timestamp.encode(),
        hashlib.sha256,
    ).digest()
    random_b64 = base64.urlsafe_b64encode(random_bytes).rstrip(b"=").decode()
    sig_b64 = base64.urlsafe_b64encode(sig).rstrip(b"=").decode()
    state = f"{random_b64}.{sig_b64}.{timestamp}"
    params = urlencode(
        {
            "client_id": SOCRATA_APP_TOKEN,
            "response_type": "code",
            "redirect_uri": SOCRATA_OAUTH_REDIRECT_URI,
            "state": state,
        }
    )
    auth_url = f"https://data.wa.gov/oauth/authorize?{params}"
    return SocrataOAuthLoginResponse(authUrl=auth_url)


@app.get("/api/auth/socrata/callback")
async def socrata_oauth_callback(
    request: Request,
    code: str | None = None,
    error: str | None = None,
    state: str | None = None,
):
    """OAuth callback — exchanges authorization code for access token, redirects to frontend."""
    base = FRONTEND_URL.rstrip("/") if FRONTEND_URL else ""

    if error:
        return RedirectResponse(url=f"{base}/#oauth_error={error}")

    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    # Validate signed state token
    if not state:
        logger.warning("OAuth state missing: full_url=%s", str(request.url))
        return RedirectResponse(url=f"{base}/#oauth_error=state_missing")

    try:
        parts = state.split(".")
        if len(parts) != 3:
            raise ValueError("wrong number of parts")
        random_b64, sig_b64, timestamp_str = parts
        timestamp = int(timestamp_str)
    except (ValueError, OverflowError):
        logger.warning("OAuth state parse failed: state=%s", state)
        return RedirectResponse(url=f"{base}/#oauth_error=state_invalid")

    # Check expiry (10 minutes)
    if abs(int(time.time()) - timestamp) > 600:
        logger.warning("OAuth state expired: timestamp=%s", timestamp)
        return RedirectResponse(url=f"{base}/#oauth_error=state_expired")

    # Verify HMAC signature
    random_bytes = base64.urlsafe_b64decode(random_b64 + "==")
    sig = base64.urlsafe_b64decode(sig_b64 + "==")
    expected_sig = hmac.new(
        _OAUTH_STATE_SECRET.encode(),
        random_bytes + timestamp_str.encode(),
        hashlib.sha256,
    ).digest()
    if not hmac.compare_digest(sig, expected_sig):
        logger.warning("OAuth state signature mismatch: full_url=%s", str(request.url))
        return RedirectResponse(url=f"{base}/#oauth_error=state_invalid")

    if not SOCRATA_APP_TOKEN or not SOCRATA_SECRET_TOKEN:
        raise HTTPException(status_code=500, detail="OAuth not configured on server")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            token_resp = await client.post(
                "https://data.wa.gov/oauth/access_token",
                data={
                    "client_id": SOCRATA_APP_TOKEN,
                    "client_secret": SOCRATA_SECRET_TOKEN,
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


# ---------------------------------------------------------------------------
# Socrata SODA helpers
# ---------------------------------------------------------------------------

NUMERIC_SOCRATA_TYPES = {"number", "money", "percent", "double"}
CATEGORICAL_SOCRATA_TYPES = {"checkbox", "flag"}
# Everything else (text, url, email, phone, calendar_date, date, point,
# location, polygon, …) needs a group-by query to decide categorical vs text.

# Limit concurrent SODA requests to avoid rate-limiting / 429s
_soda_semaphore = asyncio.Semaphore(10)


def build_socrata_auth(
    request: SocrataImportRequest,
) -> dict[str, str]:
    """Build auth headers from import request."""
    if not SOCRATA_APP_TOKEN:
        raise HTTPException(
            status_code=500,
            detail="SOCRATA_APP_TOKEN is not configured on the server.",
        )

    headers: dict[str, str] = {"X-App-Token": SOCRATA_APP_TOKEN}

    if request.oauthToken:
        headers["Authorization"] = f"OAuth {request.oauthToken}"

    return headers


def soda_escape(field_name: str) -> str:
    """Backtick-escape a Socrata field name for use in SoQL expressions."""
    if " " in field_name or any(c in field_name for c in "().-"):
        return f"`{field_name}`"
    return field_name


async def _soda_get(
    client: httpx.AsyncClient,
    soda_base: str,
    params: dict[str, str],
    headers: dict[str, str],
) -> list[dict[str, Any]]:
    """Issue a SODA query and return the parsed JSON list."""
    async with _soda_semaphore:
        resp = await client.get(soda_base, params=params, headers=headers)
    if resp.status_code != 200:
        logger.warning(
            "SODA query failed (%s): params=%s body=%s",
            resp.status_code,
            params,
            resp.text[:300],
        )
        return []
    return resp.json()


async def _compute_numeric_stats(
    client: httpx.AsyncClient,
    soda_base: str,
    field: str,
    total_rows: int,
    headers: dict[str, str],
) -> ColumnStats:
    """Compute numeric column stats using SODA aggregate + quartile lookups."""
    esc = soda_escape(field)

    # Aggregate: count, min, max, avg
    agg_rows = await _soda_get(
        client,
        soda_base,
        {
            "$select": f"count({esc}) as cnt, min({esc}) as mn, max({esc}) as mx, avg({esc}) as av",
        },
        headers,
    )

    if not agg_rows:
        return ColumnStats(
            type="empty", stats={}, nullCount=total_rows, totalCount=total_rows
        )

    row = agg_rows[0]
    cnt = int(row.get("cnt") or 0)
    if cnt == 0:
        return ColumnStats(
            type="empty", stats={}, nullCount=total_rows, totalCount=total_rows
        )

    mn = float(row.get("mn") or 0)
    mx = float(row.get("mx") or 0)
    av = float(row.get("av") or 0)

    # Quartile lookups (q1, median, q3) via $order + $offset
    offsets = {
        "q1": max(0, int(cnt * 0.25) - 1),
        "median": max(0, int(cnt * 0.5) - 1),
        "q3": max(0, int(cnt * 0.75) - 1),
    }

    async def _get_percentile(offset: int) -> float:
        rows = await _soda_get(
            client,
            soda_base,
            {
                "$select": esc,
                "$where": f"{esc} IS NOT NULL",
                "$order": f"{esc} ASC",
                "$limit": "1",
                "$offset": str(offset),
            },
            headers,
        )
        if rows and field in rows[0]:
            return float(rows[0][field])
        return av  # fallback to mean

    q1, median, q3 = await asyncio.gather(
        _get_percentile(offsets["q1"]),
        _get_percentile(offsets["median"]),
        _get_percentile(offsets["q3"]),
    )

    return ColumnStats(
        type="numeric",
        stats={
            "count": cnt,
            "min": mn,
            "max": mx,
            "mean": av,
            "q1": q1,
            "median": median,
            "q3": q3,
        },
        nullCount=total_rows - cnt,
        totalCount=total_rows,
    )


async def _compute_groupby(
    client: httpx.AsyncClient,
    soda_base: str,
    field: str,
    headers: dict[str, str],
    limit: int = 51,
) -> list[dict[str, Any]]:
    """Run a group-by query for a column. Returns up to `limit` groups sorted by count desc."""
    esc = soda_escape(field)
    return await _soda_get(
        client,
        soda_base,
        {
            "$select": f"{esc}, count(*) as cnt",
            "$group": esc,
            "$order": "cnt DESC",
            "$limit": str(limit),
            "$where": f"{esc} IS NOT NULL",
        },
        headers,
    )


def _classify_from_groupby(
    groups: list[dict[str, Any]],
    field: str,
    total_rows: int,
) -> ColumnStats:
    """Given group-by results, classify as categorical or text and build stats."""
    unique_count = len(groups)
    non_null_count = sum(int(g.get("cnt") or 0) for g in groups)
    if non_null_count == 0:
        return ColumnStats(
            type="empty", stats={}, nullCount=total_rows, totalCount=total_rows
        )

    # Heuristic matches analyzeColumn: unique ratio < 0.5 or unique < 50 → categorical
    unique_ratio = unique_count / non_null_count if non_null_count else 1.0
    has_more = unique_count >= 51  # we fetched limit=51
    if has_more:
        # More than 50 unique values — likely text unless ratio is low
        # We don't know exact unique count, estimate as 51+
        if unique_ratio >= 0.5:
            # Text column — use values from group-by (guaranteed non-null)
            samples = [
                str(g.get(field) or "") for g in groups[:5] if g.get(field) is not None
            ]
            return ColumnStats(
                type="text",
                stats={
                    "count": non_null_count,
                    "uniqueCount": unique_count,
                    "samples": samples,
                },
                nullCount=total_rows - non_null_count,
                totalCount=total_rows,
            )

    # Categorical
    values = [str(g.get(field) or "") for g in groups[:20]]
    return ColumnStats(
        type="categorical",
        stats={
            "count": non_null_count,
            "uniqueCount": unique_count,
            "values": values,
            "hasMore": has_more or unique_count > 20,
        },
        nullCount=total_rows - non_null_count,
        totalCount=total_rows,
    )


async def _compute_column_stats(
    client: httpx.AsyncClient,
    soda_base: str,
    col_meta: SocrataColumnMetadata,
    total_rows: int,
    headers: dict[str, str],
) -> tuple[str, ColumnStats]:
    """Compute stats for a single column. Returns (display_name, stats)."""
    field = col_meta.fieldName
    display_name = col_meta.name or field
    data_type = col_meta.dataTypeName.lower()

    if data_type in NUMERIC_SOCRATA_TYPES:
        stats = await _compute_numeric_stats(
            client, soda_base, field, total_rows, headers
        )
        return display_name, stats

    if data_type in CATEGORICAL_SOCRATA_TYPES:
        groups = await _compute_groupby(client, soda_base, field, headers, limit=51)
        non_null = sum(int(g.get("cnt") or 0) for g in groups)
        values = [str(g.get(field) or "") for g in groups[:20]]
        unique_count = len(groups)
        return display_name, ColumnStats(
            type="categorical",
            stats={
                "count": non_null,
                "uniqueCount": unique_count,
                "values": values,
                "hasMore": unique_count > 20,
            },
            nullCount=total_rows - non_null,
            totalCount=total_rows,
        )

    # Ambiguous type (text, url, calendar_date, etc.) — run group-by to decide
    groups = await _compute_groupby(client, soda_base, field, headers, limit=51)
    stats = _classify_from_groupby(groups, field, total_rows)
    return display_name, stats


# ---------------------------------------------------------------------------
# Socrata import endpoint — fetches metadata + stats via SODA API
# ---------------------------------------------------------------------------


@app.post("/api/socrata/import", response_model=SocrataImportResponse)
async def socrata_import(request: SocrataImportRequest) -> SocrataImportResponse:
    if not request.datasetId or not request.datasetId.strip():
        raise HTTPException(status_code=400, detail="Dataset ID is required")

    dataset_id = request.datasetId.strip()
    headers = build_socrata_auth(request)

    metadata_url = f"https://data.wa.gov/api/views/{dataset_id}.json"
    soda_base = f"https://data.wa.gov/resource/{dataset_id}.json"

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            # Phase 1: metadata + row count + sample rows (parallel)
            metadata_resp, count_rows, sample_rows = await asyncio.gather(
                client.get(metadata_url, headers=headers),
                _soda_get(client, soda_base, {"$select": "count(*) as total"}, headers),
                _soda_get(client, soda_base, {"$limit": "10"}, headers),
            )

            if metadata_resp.status_code != 200:
                raise HTTPException(
                    status_code=metadata_resp.status_code,
                    detail=f"Failed to fetch dataset metadata: {metadata_resp.reason_phrase}",
                )

            metadata = metadata_resp.json()
            dataset_name = metadata.get("name") or dataset_id
            dataset_description = metadata.get("description") or ""

            total_rows = int(count_rows[0]["total"]) if count_rows else 0

            # Extract column metadata (skip system columns starting with ':')
            columns: list[SocrataColumnMetadata] = []
            for col in metadata.get("columns", []):
                field_name = col.get("fieldName") or ""
                if field_name.startswith(":"):
                    continue
                columns.append(
                    SocrataColumnMetadata(
                        fieldName=field_name,
                        name=col.get("name") or "",
                        description=col.get("description") or "",
                        dataTypeName=col.get("dataTypeName") or "",
                    )
                )

            if not columns:
                raise HTTPException(
                    status_code=400, detail="No columns found in dataset metadata"
                )

            # Phase 2+3: compute stats for all columns in parallel
            stats_tasks = [
                _compute_column_stats(client, soda_base, col, total_rows, headers)
                for col in columns
            ]
            stats_results = await asyncio.gather(*stats_tasks, return_exceptions=True)

            column_stats: dict[str, ColumnStats] = {}
            for result in stats_results:
                if isinstance(result, BaseException):
                    logger.warning("Column stats computation failed: %s", result)
                    continue
                display_name, col_stats = result
                column_stats[display_name] = col_stats

            # Remap sample row keys from fieldName to displayName
            field_to_display = {c.fieldName: (c.name or c.fieldName) for c in columns}
            remapped_samples: list[dict[str, Any]] = []
            for row in sample_rows:
                remapped: dict[str, Any] = {}
                for key, value in row.items():
                    display = field_to_display.get(key, key)
                    remapped[display] = value
                remapped_samples.append(remapped)

            return SocrataImportResponse(
                sampleRows=remapped_samples,
                totalRowCount=total_rows,
                fileName=f"{dataset_name}.csv",
                datasetName=dataset_name,
                datasetDescription=dataset_description,
                columns=columns,
                columnStats=column_stats,
            )

    except HTTPException:
        raise
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

    # Build auth — write operations require OAuth login
    headers: dict[str, str] = {"Content-Type": "application/json"}

    if request.oauthToken:
        headers["Authorization"] = f"OAuth {request.oauthToken}"
    else:
        raise HTTPException(
            status_code=400,
            detail="Authentication required to update metadata on data.wa.gov. "
            "Please sign in with OAuth.",
        )

    if not SOCRATA_APP_TOKEN:
        raise HTTPException(
            status_code=500,
            detail="SOCRATA_APP_TOKEN is not configured on the server.",
        )
    headers["X-App-Token"] = SOCRATA_APP_TOKEN

    metadata_url = f"https://data.wa.gov/api/views/{dataset_id}.json"

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            # 1. Fetch current metadata to get column IDs
            meta_resp = await client.get(metadata_url, headers=headers)
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
    properties["confidence"] = {"type": "number", "minimum": 0.0, "maximum": 1.0}
    required.append("confidence")

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


def calculate_confidence_metrics(
    models_metrics: list[JudgeMetrics],
    judge_certainty: float,
    outputs: list[str]
) -> dict[str, float]:
    """Calculate advanced composite confidence score with comprehensive statistical analysis."""
    import math
    import statistics
    from scipy import stats as scipy_stats

    # 1. Judge certainty (already provided by judge, 0-1)
    judge_certainty_norm = judge_certainty

    # 2. Inter-model agreement with advanced metrics
    if len(models_metrics) > 1:
        agreements = []
        score_differences = []

        for i in range(len(models_metrics)):
            for j in range(i + 1, len(models_metrics)):
                scores1 = list(models_metrics[i].scores.values())
                scores2 = list(models_metrics[j].scores.values())

                # Calculate various agreement metrics
                avg_diff = sum(abs(a - b) for a, b in zip(scores1, scores2)) / len(scores1)
                agreement = 1 - (avg_diff / 10)  # Normalize to 0-1
                agreements.append(agreement)
                score_differences.extend([abs(a - b) for a, b in zip(scores1, scores2)])

        inter_model_agreement = sum(agreements) / len(agreements) if agreements else 0.5

        # Calculate confidence interval for agreement
        if len(agreements) > 1:
            agreement_std = statistics.stdev(agreements) if len(agreements) > 1 else 0
            agreement_ci_lower = max(0, inter_model_agreement - 1.96 * agreement_std / math.sqrt(len(agreements)))
            agreement_ci_upper = min(1, inter_model_agreement + 1.96 * agreement_std / math.sqrt(len(agreements)))
        else:
            agreement_ci_lower = agreement_ci_upper = inter_model_agreement

    else:
        inter_model_agreement = 0.5
        agreement_ci_lower = agreement_ci_upper = 0.5

    # 3. Statistical plausibility with outlier detection and Z-scores
    all_scores = [score for metrics in models_metrics for score in metrics.scores.values()]
    if all_scores:
        mean_score = statistics.mean(all_scores)
        stdev_score = statistics.stdev(all_scores) if len(all_scores) > 1 else 0

        # Z-score normalization and outlier detection
        z_scores = [(score - mean_score) / stdev_score if stdev_score > 0 else 0 for score in all_scores]
        outliers = sum(1 for z in z_scores if abs(z) > 2.5)  # Z-score > 2.5 is outlier
        outlier_ratio = outliers / len(all_scores)

        # Statistical plausibility considers variance and outliers
        variance = statistics.variance(all_scores) if len(all_scores) > 1 else 0
        variance_penalty = min(1, variance / 25)  # Normalize variance penalty
        outlier_penalty = outlier_ratio  # Direct penalty for outliers

        statistical_plausibility = max(0, 1 - variance_penalty - outlier_penalty)

        # Confidence interval for mean score
        if len(all_scores) > 1:
            score_ci_margin = 1.96 * stdev_score / math.sqrt(len(all_scores))
            score_ci_lower = mean_score - score_ci_margin
            score_ci_upper = mean_score + score_ci_margin
        else:
            score_ci_lower = score_ci_upper = mean_score

    else:
        statistical_plausibility = 0.5
        score_ci_lower = score_ci_upper = 0

    # 4. Rule validation strength with Bayesian updating
    # Use validation results if available (placeholder for now)
    avg_scores = [sum(m.scores.values()) / len(m.scores) for m in models_metrics]
    score_range = max(avg_scores) - min(avg_scores) if avg_scores else 0

    # Bayesian updating: prior belief + evidence
    prior_confidence = 0.5  # Neutral prior
    evidence_strength = max(0, 1 - score_range / 20)  # Evidence from score consistency

    # Simple Bayesian update
    likelihood_ratio = evidence_strength / (1 - evidence_strength) if evidence_strength < 1 else 10
    posterior_odds = prior_confidence / (1 - prior_confidence) * likelihood_ratio
    rule_validation_strength = posterior_odds / (1 + posterior_odds)

    # Credence calibration: adjust confidence based on historical accuracy
    # For now, use a simple calibration based on score distribution
    if stdev_score > 0:
        calibration_factor = 1 / (1 + stdev_score / 5)  # Penalize high variance
        calibrated_confidence = rule_validation_strength * calibration_factor
    else:
        calibrated_confidence = rule_validation_strength

    # 5. Composite confidence score with weighted components
    composite_confidence_score = (
        0.35 * judge_certainty_norm +
        0.25 * inter_model_agreement +
        0.20 * statistical_plausibility +
        0.20 * calibrated_confidence
    )

    # Likelihood ratio for final confidence assessment
    confidence_likelihood_ratio = composite_confidence_score / (1 - composite_confidence_score) if composite_confidence_score < 1 else 10

    # 6. Additional Advanced Statistical Metrics

    # Effect size measures (Cohen's d for pairwise comparisons)
    effect_sizes = []
    if len(models_metrics) > 1:
        for i in range(len(models_metrics)):
            for j in range(i + 1, len(models_metrics)):
                scores_i = list(models_metrics[i].scores.values())
                scores_j = list(models_metrics[j].scores.values())
                if len(scores_i) > 1 and len(scores_j) > 1:
                    mean_i = statistics.mean(scores_i)
                    mean_j = statistics.mean(scores_j)
                    std_i = statistics.stdev(scores_i)
                    std_j = statistics.stdev(scores_j)
                    pooled_std = math.sqrt((std_i**2 + std_j**2) / 2)
                    if pooled_std > 0:
                        cohens_d = abs(mean_i - mean_j) / pooled_std
                        effect_sizes.append(cohens_d)

    avg_effect_size = statistics.mean(effect_sizes) if effect_sizes else 0

    # Distribution statistics (skewness, kurtosis)
    if len(all_scores) > 2:
        skewness = scipy_stats.skew(all_scores)
        kurtosis = scipy_stats.kurtosis(all_scores)
    else:
        skewness = 0
        kurtosis = 0

    # Robust statistics (median-based measures)
    median_score = statistics.median(all_scores) if all_scores else 0
    trimmed_mean = statistics.mean(sorted(all_scores)[1:-1]) if len(all_scores) > 2 else mean_score

    # Ranking statistics (Kendall's tau, Spearman's rho)
    ranking_consistency = 0
    if len(models_metrics) > 1:
        # Calculate ranking consistency across models
        rankings = []
        for metrics in models_metrics:
            # Sort categories by score descending to get ranking
            sorted_items = sorted(metrics.scores.items(), key=lambda x: x[1], reverse=True)
            rankings.append([item[0] for item in sorted_items])

        # Calculate pairwise ranking agreement
        consistency_scores = []
        for i in range(len(rankings)):
            for j in range(i + 1, len(rankings)):
                # Simple ranking agreement (fraction of categories with same relative ordering)
                rank1 = rankings[i]
                rank2 = rankings[j]
                agreements = 0
                total_pairs = 0
                for a in range(len(rank1)):
                    for b in range(a + 1, len(rank1)):
                        idx_a1 = rank1.index(rank1[a])
                        idx_b1 = rank1.index(rank1[b])
                        idx_a2 = rank2.index(rank1[a])
                        idx_b2 = rank2.index(rank1[b])
                        if (idx_a1 < idx_b1) == (idx_a2 < idx_b2):
                            agreements += 1
                        total_pairs += 1
                if total_pairs > 0:
                    consistency_scores.append(agreements / total_pairs)

        ranking_consistency = statistics.mean(consistency_scores) if consistency_scores else 0

    # Performance stability (coefficient of variation)
    coefficient_of_variation = (stdev_score / mean_score) if mean_score > 0 else 0

    # Statistical significance (ANOVA-like F-test for multiple comparisons)
    if len(models_metrics) > 1:
        # One-way ANOVA F-statistic
        group_scores = [list(m.scores.values()) for m in models_metrics]
        f_statistic, p_value = scipy_stats.f_oneway(*group_scores) if len(group_scores) > 1 else (0, 1)
    else:
        f_statistic = 0
        p_value = 1

    # Correlation analysis between scoring categories
    category_correlations = []
    if len(models_metrics) > 0:
        category_keys = list(models_metrics[0].scores.keys())
        if len(category_keys) > 1:
            for i in range(len(category_keys)):
                for j in range(i + 1, len(category_keys)):
                    scores_i = [m.scores[category_keys[i]] for m in models_metrics]
                    scores_j = [m.scores[category_keys[j]] for m in models_metrics]
                    if len(scores_i) > 1 and len(scores_j) > 1:
                        corr, _ = scipy_stats.pearsonr(scores_i, scores_j)
                        category_correlations.append(abs(corr))

    avg_category_correlation = statistics.mean(category_correlations) if category_correlations else 0

    # Reliability metrics (Cronbach's alpha for inter-rater reliability)
    cronbach_alpha = 0
    if len(models_metrics) > 1 and len(category_keys) > 1:
        # Cronbach's alpha calculation
        n_items = len(category_keys)
        n_raters = len(models_metrics)
        item_variances = [statistics.variance([m.scores[k] for m in models_metrics]) for k in category_keys]
        total_variance = statistics.variance([score for m in models_metrics for score in m.scores.values()])

        if total_variance > 0:
            cronbach_alpha = (n_items / (n_items - 1)) * (1 - sum(item_variances) / total_variance)

    return {
        "judge_certainty": judge_certainty_norm,
        "inter_model_agreement": inter_model_agreement,
        "agreement_ci_lower": agreement_ci_lower,
        "agreement_ci_upper": agreement_ci_upper,
        "statistical_plausibility": statistical_plausibility,
        "score_ci_lower": score_ci_lower,
        "score_ci_upper": score_ci_upper,
        "outlier_ratio": outlier_ratio if 'outlier_ratio' in locals() else 0,
        "rule_validation_strength": calibrated_confidence,
        "likelihood_ratio": confidence_likelihood_ratio,
        "composite_confidence_score": composite_confidence_score,
        # Additional advanced metrics
        "effect_size_cohens_d": avg_effect_size,
        "distribution_skewness": skewness,
        "distribution_kurtosis": kurtosis,
        "robust_median_score": median_score,
        "robust_trimmed_mean": trimmed_mean,
        "ranking_consistency": ranking_consistency,
        "performance_stability_cv": coefficient_of_variation,
        "statistical_significance_f": f_statistic,
        "statistical_significance_p": p_value,
        "category_correlation_avg": avg_category_correlation,
        "reliability_cronbach_alpha": cronbach_alpha,
    }


def _aggregate_usage(
    first: dict[str, int],
    second: dict[str, int],
) -> dict[str, int]:
    return {
        "promptTokens": first.get("promptTokens", 0) + second.get("promptTokens", 0),
        "completionTokens": first.get("completionTokens", 0) + second.get("completionTokens", 0),
        "totalTokens": first.get("totalTokens", 0) + second.get("totalTokens", 0),
    }


async def _run_judge_request(
    client: AsyncOpenAI,
    model: str,
    messages: list[ChatCompletionMessageParam],
    schema: JSONSchema,
) -> tuple[dict[str, Any], dict[str, int]]:
    response = await client.chat.completions.create(
        model=model,
        messages=messages,
        response_format={
            "type": "json_schema",
            "json_schema": schema,
        },
    )

    content = response.choices[0].message.content
    if not content:
        raise ValueError("Empty response from judge model")

    result = json.loads(content)
    usage = {
        "promptTokens": response.usage.prompt_tokens if response.usage else 0,
        "completionTokens": response.usage.completion_tokens if response.usage else 0,
        "totalTokens": response.usage.total_tokens if response.usage else 0,
    }
    return result, usage


async def _evaluate_pairwise_judgements(
    client: AsyncOpenAI,
    resolved_model: str,
    request: JudgeRequest,
    original_outputs: list[str],
    categories: list[ScoringCategory],
    category_keys: list[str],
) -> tuple[list[PairwiseComparison], dict[str, int]]:
    pairwise_results: list[PairwiseComparison] = []
    aggregated_usage = {"promptTokens": 0, "completionTokens": 0, "totalTokens": 0}

    for i in range(len(original_outputs)):
        for j in range(i + 1, len(original_outputs)):
            pair_prompt = request.judgeEvaluationPrompt.replace("{context}", request.context)
            for k, output in enumerate(original_outputs):
                replacement = output if k == i else (original_outputs[j] if k == j else "")
                pair_prompt = pair_prompt.replace(f"{{output_{k}}}", replacement)

            messages: list[ChatCompletionMessageParam] = []
            if request.judgeSystemPrompt and request.judgeSystemPrompt.strip():
                messages.append({"role": "system", "content": request.judgeSystemPrompt})
            messages.append({"role": "user", "content": pair_prompt})

            pair_schema = build_judge_schema(categories, 2)
            pair_result, usage = await _run_judge_request(client, resolved_model, messages, pair_schema)
            aggregated_usage = _aggregate_usage(aggregated_usage, usage)

            models_metrics = [
                JudgeMetrics.from_dict(pair_result[f"model{n + 1}"], category_keys)
                for n in range(2)
            ]

            winner_str = pair_result["winner"]
            winner_index = None if winner_str == "tie" else (i if winner_str == "1" else j)
            pairwise_results.append(
                PairwiseComparison(
                    modelAIndex=i,
                    modelBIndex=j,
                    models=models_metrics,
                    winnerIndex=winner_index,
                    winnerReasoning=pair_result["winnerReasoning"],
                    confidence_metrics=calculate_confidence_metrics(
                        models_metrics,
                        pair_result.get("confidence", 0.5),
                        [original_outputs[i], original_outputs[j]],
                    ),
                )
            )

    return pairwise_results, aggregated_usage


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

        result, usage = await _run_judge_request(client, resolved_model, messages, judge_schema)

        # Parse N model results (shared for all providers)
        models_metrics: list[JudgeMetrics] = [
            JudgeMetrics.from_dict(result[f"model{i + 1}"], category_keys)
            for i in range(model_count)
        ]

        # Parse winner: "1", "2", ..., "N" -> 0-based index, "tie" -> None
        winner_str = result["winner"]
        winner_index = None if winner_str == "tie" else int(winner_str) - 1

        # Calculate confidence metrics
        confidence = result.get("confidence", 0.5)  # Default to 0.5 if not provided
        confidence_metrics = calculate_confidence_metrics(
            models_metrics, confidence, request.outputs
        )

        pairwise_comparisons, pairwise_usage = await _evaluate_pairwise_judgements(
            client,
            resolved_model,
            request,
            request.outputs,
            categories,
            category_keys,
        )

        total_usage = _aggregate_usage(usage, pairwise_usage)

        return JudgeResponse(
            models=models_metrics,
            winnerIndex=winner_index,
            winnerReasoning=result["winnerReasoning"],
            usage=total_usage,
            confidence_metrics=confidence_metrics,
            pairwiseComparisons=pairwise_comparisons,
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


# Validation endpoint
@app.post("/api/validation/dataset", response_model=ValidationResult)
async def validate_dataset(request: DatasetValidationRequest) -> ValidationResult:
    """Validate dataset metadata against WA standards."""
    try:
        engine = ValidationEngine()
        dataset_data = request.dict(exclude_unset=True)
        result = engine.validate_dataset(dataset_data)
        return result
    except Exception as e:
        logger.exception("Validation failed")
        raise HTTPException(
            status_code=500, detail=f"Validation failed: {str(e)}"
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
