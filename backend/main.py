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

from .models import (
    ChatRequest,
    ColumnStats,
    HealthResponse,
    SocrataCategoriesResponse,
    SocrataColumnMetadata,
    SocrataExportRequest,
    SocrataExportResponse,
    SocrataImportRequest,
    SocrataImportResponse,
    SocrataOAuthLoginResponse,
    SocrataOAuthUserInfoRequest,
    SocrataOAuthUserInfo,
)

# Load environment variables from .env file (local dev) and .env.databricks (Databricks deployment)
load_dotenv()
load_dotenv(Path(__file__).resolve().parent.parent / ".env.databricks", override=True)

# Configuration
SOCRATA_APP_TOKEN = os.getenv("SOCRATA_APP_TOKEN", "")
SOCRATA_SECRET_TOKEN = os.getenv("SOCRATA_SECRET_TOKEN", "")
SOCRATA_OAUTH_REDIRECT_URI = os.getenv(
    "SOCRATA_OAUTH_REDIRECT_URI",
    "http://localhost:8000/api/auth/socrata/callback",
)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
LLM_ENDPOINT = os.getenv("LLM_ENDPOINT", "")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "")
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


# Socrata OAuth endpoints


def _build_oauth_authorize_url(is_retry: bool = False) -> str:
    """Build a data.wa.gov OAuth authorize URL with a signed state token.

    When *is_retry* is True an ``R`` flag is appended to the state so the
    callback knows not to retry again (prevents infinite redirect loops).
    """
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
    if is_retry:
        state += ".R"
    params = urlencode(
        {
            "client_id": SOCRATA_APP_TOKEN,
            "response_type": "code",
            "redirect_uri": SOCRATA_OAUTH_REDIRECT_URI,
            "state": state,
        }
    )
    return f"https://data.wa.gov/oauth/authorize?{params}"


@app.get("/api/auth/socrata/login", response_model=SocrataOAuthLoginResponse)
async def socrata_oauth_login() -> SocrataOAuthLoginResponse:
    """Return the OAuth authorization URL for data.wa.gov sign-in."""
    if not SOCRATA_APP_TOKEN:
        raise HTTPException(
            status_code=400,
            detail="OAuth not configured. Set SOCRATA_APP_TOKEN in the environment.",
        )
    return SocrataOAuthLoginResponse(authUrl=_build_oauth_authorize_url())


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
        if len(parts) not in (3, 4):
            raise ValueError("wrong number of parts")
        random_b64, sig_b64, timestamp_str = parts[0], parts[1], parts[2]
        is_retry = len(parts) == 4 and parts[3] == "R"
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
                # data.wa.gov may reissue a stale authorization code from a
                # previous session.  If so, retry once — the failed exchange
                # invalidates the old code, so the next authorize round-trip
                # will produce a fresh one.
                if not is_retry and "Authorization code invalid" in token_resp.text:
                    logger.info("Stale authorization code — retrying OAuth flow")
                    return RedirectResponse(
                        url=_build_oauth_authorize_url(is_retry=True)
                    )
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
async def socrata_oauth_userinfo(
    body: SocrataOAuthUserInfoRequest,
) -> SocrataOAuthUserInfo:
    """Fetch the current authenticated user's info from data.wa.gov."""
    token = body.oauthToken

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

# Cache for the live category list fetched from the Socrata catalog API.
# Populated lazily on first request; refreshed after TTL expires.
_categories_cache: dict[str, Any] = {"value": None, "fetched_at": 0.0}
_CATEGORIES_TTL_SECONDS = 24 * 60 * 60


def build_socrata_auth(
    request: SocrataImportRequest | SocrataExportRequest,
) -> dict[str, str]:
    """Build auth headers from import/export request.

    Priority: OAuth token > API Key (Basic Auth) > app token only.
    """
    if not SOCRATA_APP_TOKEN:
        raise HTTPException(
            status_code=500,
            detail="SOCRATA_APP_TOKEN is not configured on the server.",
        )

    headers: dict[str, str] = {"X-App-Token": SOCRATA_APP_TOKEN}

    if request.oauthToken:
        headers["Authorization"] = f"OAuth {request.oauthToken}"
    elif request.apiKeyId and request.apiKeySecret:
        credentials = base64.b64encode(
            f"{request.apiKeyId}:{request.apiKeySecret}".encode()
        ).decode()
        headers["Authorization"] = f"Basic {credentials}"

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
            row_label = (
                metadata.get("metadata", {}).get("rowLabel", "")
                or metadata.get("rowLabel", "")
                or ""
            )
            category = metadata.get("category") or ""
            raw_tags = metadata.get("tags")
            if isinstance(raw_tags, list):
                tags = [str(t) for t in raw_tags if t]
            else:
                tags = []

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
                rowLabel=row_label,
                category=category,
                tags=tags,
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

    # Build auth — write operations require authentication (OAuth or API Key)
    if not request.oauthToken and not (request.apiKeyId and request.apiKeySecret):
        raise HTTPException(
            status_code=400,
            detail="Authentication required to update metadata on data.wa.gov. "
            "Please sign in with OAuth or provide API Key credentials.",
        )

    headers = build_socrata_auth(request)
    headers["Content-Type"] = "application/json"

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

            # 2. Build update payload — merge into existing metadata to avoid overwriting
            update_payload: dict[str, Any] = {}
            existing_metadata: dict[str, Any] = current_metadata.get("metadata", {})

            if request.datasetTitle is not None:
                update_payload["name"] = request.datasetTitle

            if request.datasetDescription is not None:
                update_payload["description"] = request.datasetDescription

            if request.category is not None:
                update_payload["category"] = request.category

            if request.tags is not None:
                update_payload["tags"] = request.tags

            metadata_changed = False

            if request.rowLabel is not None:
                existing_metadata["rowLabel"] = request.rowLabel
                metadata_changed = True

            if metadata_changed:
                update_payload["metadata"] = existing_metadata

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
            if request.datasetTitle is not None:
                parts.append("dataset title")
            if request.datasetDescription is not None:
                parts.append("dataset description")
            if request.rowLabel is not None:
                parts.append("row label")
            if request.category is not None:
                parts.append("category")
            if request.tags is not None:
                parts.append(f"{len(request.tags)} tag{'s' if len(request.tags) != 1 else ''}")
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


# ---------------------------------------------------------------------------
# Socrata categories endpoint — live list of domain categories from data.wa.gov
# ---------------------------------------------------------------------------


async def _fetch_socrata_categories() -> list[str]:
    """Fetch the live domain category list from Socrata's public catalog API."""
    url = "https://api.us.socrata.com/api/catalog/v1/domain_categories"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, params={"domains": "data.wa.gov"})
        resp.raise_for_status()
        data = resp.json()

    results = data.get("results") or []
    seen: set[str] = set()
    categories: list[str] = []
    for entry in results:
        raw = entry.get("domain_category") or entry.get("category")
        if not raw:
            continue
        name = str(raw).strip()
        if not name or name in seen:
            continue
        seen.add(name)
        categories.append(name)
    categories.sort(key=str.casefold)
    return categories


@app.get("/api/socrata/categories", response_model=SocrataCategoriesResponse)
async def socrata_categories() -> SocrataCategoriesResponse:
    """Return the live list of data.wa.gov categories, cached for 24 hours."""
    now = time.time()
    cached = _categories_cache["value"]
    fetched_at = _categories_cache["fetched_at"]

    if cached is not None and (now - fetched_at) < _CATEGORIES_TTL_SECONDS:
        return SocrataCategoriesResponse(categories=cached)

    try:
        categories = await _fetch_socrata_categories()
    except Exception as e:
        logger.warning("Failed to fetch Socrata categories: %s", e)
        if cached is not None:
            return SocrataCategoriesResponse(categories=cached)
        raise HTTPException(
            status_code=503,
            detail="Could not reach Socrata catalog API to load categories.",
        )

    _categories_cache["value"] = categories
    _categories_cache["fetched_at"] = now
    return SocrataCategoriesResponse(categories=categories)


# OpenAI streaming chat endpoint
@app.post("/api/openai/chat/stream")
async def openai_chat_stream(
    request: ChatRequest, http_request: Request
) -> StreamingResponse:
    # Get configuration from the request or environment
    base_url = request.baseURL or LLM_ENDPOINT
    api_key = request.apiKey or LLM_API_KEY
    model = request.model or LLM_MODEL

    # Validate configuration
    missing_config = []
    if not base_url:
        missing_config.append("Base URL (LLM_ENDPOINT)")
    if not api_key:
        missing_config.append("API Key (LLM_API_KEY)")
    if not model:
        missing_config.append("Model (LLM_MODEL)")

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
