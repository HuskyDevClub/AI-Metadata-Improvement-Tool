import asyncio
import base64
import logging
from typing import Any, cast

import httpx
from fastapi import HTTPException

from .config import SOCRATA_APP_TOKEN
from .models import ColumnStats, SocrataColumnMetadata

logger = logging.getLogger(__name__)

NUMERIC_SOCRATA_TYPES = {"number", "money", "percent", "double"}
CATEGORICAL_SOCRATA_TYPES = {"checkbox", "flag"}
# Everything else (text, url, email, phone, calendar_date, date, point,
# location, polygon, …) needs a group-by query to decide categorical vs text.

# Limit concurrent SODA requests to avoid rate-limiting / 429s
_soda_semaphore = asyncio.Semaphore(10)


def build_socrata_auth(session: dict[str, Any]) -> dict[str, str]:
    """Build auth headers from an encrypted session payload.

    `session` is the decrypted cookie payload (OAuth or API key).
    Falls back to X-App-Token-only auth (read-only, public datasets) when no
    valid auth keys are present.
    """
    if not SOCRATA_APP_TOKEN:
        raise HTTPException(
            status_code=500,
            detail="SOCRATA_APP_TOKEN is not configured on the server.",
        )

    headers: dict[str, str] = {
        "X-App-Token": SOCRATA_APP_TOKEN,
        "User-Agent": "data-wa-gov-AI-Metadata-Tool/1.0",
        "X-App-Source": "AI-Metadata-Improvement-Tool",
    }

    kind = session.get("kind")
    if kind == "oauth" and session.get("token"):
        headers["Authorization"] = f"OAuth {session['token']}"
    elif kind == "api_key" and session.get("id") and session.get("secret"):
        credentials = base64.b64encode(
            f"{session['id']}:{session['secret']}".encode()
        ).decode()
        headers["Authorization"] = f"Basic {credentials}"

    return headers


def soda_escape(field_name: str) -> str:
    """Backtick-escape a Socrata field name for use in SoQL expressions."""
    if " " in field_name or any(c in field_name for c in "().-"):
        return f"`{field_name}`"
    return field_name


async def soda_get(
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
    return cast(list[dict[str, Any]], resp.json())


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
    agg_rows = await soda_get(
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
        rows = await soda_get(
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
    return await soda_get(
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


async def compute_column_stats(
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
