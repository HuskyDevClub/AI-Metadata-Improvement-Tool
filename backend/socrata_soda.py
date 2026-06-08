import asyncio
import base64
import logging
from typing import Any, cast

import httpx
from fastapi import HTTPException

from .config import SOCRATA_APP_TOKEN
from .models import ColumnStats, SocrataColumnMetadata

logger = logging.getLogger(__name__)

# The sets below mix two vocabularies that both surface in `dataTypeName`:
#   - Canonical SoQL types from dev.socrata.com/docs/datatypes:
#       number, text, url, checkbox, fixed_timestamp, floating_timestamp,
#       point, line, polygon, multipoint, multiline, multipolygon, location.
#   - Legacy NBE/OBE render types that older datasets still emit (not on the
#     canonical page, but observed in the wild):
#       money, percent, double, calendar_date, date, flag, email, phone,
#       document, photo, dataset_link, nested_table.
# Keep both — modern datasets emit canonical names, older ones the legacy ones.

NUMERIC_SOCRATA_TYPES = {"number", "money", "percent", "double"}
CATEGORICAL_SOCRATA_TYPES = {"checkbox", "flag"}
TEMPORAL_SOCRATA_TYPES = {
    "calendar_date",
    "date",
    "floating_timestamp",
    "fixed_timestamp",
}
GEOSPATIAL_SOCRATA_TYPES = {
    "point",
    "line",
    "polygon",
    "multipoint",
    "multiline",
    "multipolygon",
    "location",
}
# url and (legacy) phone are nested objects; handled by dedicated paths
# that project the subfields so distinct/sampling work on the inner string
# instead of the wrapping object (avoids `{'url': ..., 'description': ...}`
# / `{'phone_number': ..., 'phone_type': ...}` reaching the LLM prompt).
URL_SOCRATA_TYPE = "url"
PHONE_SOCRATA_TYPE = "phone"
# email is a flat string — near-unique, sample a few values directly without
# a group-by. (Legacy `phone` is structured, see PHONE_SOCRATA_TYPE above.)
SAMPLED_TEXT_SOCRATA_TYPES = {"email"}
# Binary or pointer types — cells contain blob refs / nested rows that don't
# meaningfully sample. Return count only.
OPAQUE_SOCRATA_TYPES = {"document", "photo", "dataset_link", "nested_table"}
# Anything not above (plain text, html, …) falls through to a group-by query
# that decides categorical vs text by unique-ratio.

TEXT_SAMPLE_MAX_LEN = 120
# Bounded categorical types (checkbox/flag) saturate well below this — used
# both as the SODA group-by limit and as the threshold for `hasMore`.
CATEGORICAL_BOUNDED_LIMIT = 10
# For ambiguous (plain text / unknown) columns: the distinct-count cutoff
# below which a column is categorical regardless of unique-ratio, and the
# number of representative values fetched via group-by. Mirrors analyzeColumn.
TEXT_GROUPBY_LIMIT = 50

# Limit concurrent SODA requests to avoid rate-limiting / 429s
_soda_semaphore = asyncio.Semaphore(10)


def _truncate_sample(value: str, max_len: int = TEXT_SAMPLE_MAX_LEN) -> str:
    """Cap a sample cell so a single huge value doesn't bloat the LLM prompt."""
    return value if len(value) <= max_len else value[: max_len - 3] + "..."


def _groupby_value_str(value: Any) -> str:
    """Render a group-by key as a display string, preserving falsy non-null values.

    ``str(value or "")`` looks equivalent but silently maps a checkbox/flag
    column's legitimate ``False`` (and a numeric ``0``) to an empty string,
    because both are falsy — so a boolean column's distinct values come back as
    ["", "True"] instead of ["False", "True"]. Group-by queries already filter
    NULLs at the SoQL level, so only a genuine None should collapse to "".
    """
    return "" if value is None else str(value)


def socrata_credentials(session: dict[str, Any]) -> list[dict[str, Any]]:
    """Usable Socrata credentials in the session, OAuth first then API key.

    The OAuth sign-in and the saved API key are independent identities that may
    belong to different people; either, both, or neither may be present. The
    order matters: callers that want a single "preferred" identity take the
    head, and write paths try each in turn (OAuth, then API key as a fallback).

    Also accepts the legacy single-`kind` session shape, for cookies issued
    before OAuth and API key could coexist.
    """
    creds: list[dict[str, Any]] = []

    oauth = session.get("oauth")
    if isinstance(oauth, dict) and oauth.get("token"):
        creds.append({"kind": "oauth", "token": oauth["token"]})

    api_key = session.get("api_key")
    if isinstance(api_key, dict) and api_key.get("id") and api_key.get("secret"):
        creds.append(
            {
                "kind": "api_key",
                "id": api_key["id"],
                "secret": api_key["secret"],
            }
        )

    # Legacy shape: {"kind": "oauth"|"api_key", "token"|"id"+"secret": ...}.
    if not creds:
        legacy_kind = session.get("kind")
        if legacy_kind == "oauth" and session.get("token"):
            creds.append({"kind": "oauth", "token": session["token"]})
        elif legacy_kind == "api_key" and session.get("id") and session.get("secret"):
            creds.append(
                {
                    "kind": "api_key",
                    "id": session["id"],
                    "secret": session["secret"],
                }
            )

    return creds


def build_auth_headers(credential: dict[str, Any] | None) -> dict[str, str]:
    """Build Socrata request headers for one credential (or app-token-only).

    Passing ``None`` yields anonymous, X-App-Token-only headers — read access
    to public datasets, no write access.
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

    if credential:
        kind = credential.get("kind")
        if kind == "oauth" and credential.get("token"):
            headers["Authorization"] = f"OAuth {credential['token']}"
        elif kind == "api_key" and credential.get("id") and credential.get("secret"):
            raw = f"{credential['id']}:{credential['secret']}".encode()
            headers["Authorization"] = f"Basic {base64.b64encode(raw).decode()}"

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
    """Compute numeric column stats using SODA aggregate + quartile lookups.

    A numeric column with few distinct values (e.g. a 1–5 rating, a FIPS or
    status code) is really categorical — the distinct set, not a min/max/mean,
    is what matters. We fetch the distinct count alongside the other aggregates
    (one extra term, no extra round-trip) and hand off to the categorical path
    when the cardinality is low. Mirrors the frontend analyzeColumn heuristic.
    """
    esc = soda_escape(field)

    # Aggregate: count, distinct count, min, max, avg
    agg_rows = await soda_get(
        client,
        soda_base,
        {
            "$select": (
                f"count({esc}) as cnt, count(distinct {esc}) as ucnt, "
                f"min({esc}) as mn, max({esc}) as mx, avg({esc}) as av"
            ),
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

    distinct = _coerce_unique_count(row.get("ucnt"), cnt, field)
    unique_ratio = distinct / cnt
    if unique_ratio < 0.5 or distinct < TEXT_GROUPBY_LIMIT:
        return await _compute_numeric_categorical_stats(
            client, soda_base, field, total_rows, cnt, distinct, mn, mx, av, headers
        )

    # Quartile lookups (q1, median, q3) and mode, all in parallel.
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

    async def _get_mode() -> float:
        rows = await soda_get(
            client,
            soda_base,
            {
                "$select": f"{esc}, count(*) as cnt",
                "$group": esc,
                "$where": f"{esc} IS NOT NULL",
                "$order": "cnt DESC",
                "$limit": "1",
            },
            headers,
        )
        if rows and field in rows[0]:
            try:
                return float(rows[0][field])
            except (TypeError, ValueError):
                pass
        return av  # fallback to mean

    q1, median, q3, mode = await asyncio.gather(
        _get_percentile(offsets["q1"]),
        _get_percentile(offsets["median"]),
        _get_percentile(offsets["q3"]),
        _get_mode(),
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
            "mode": mode,
        },
        nullCount=total_rows - cnt,
        totalCount=total_rows,
    )


async def _compute_numeric_categorical_stats(
    client: httpx.AsyncClient,
    soda_base: str,
    field: str,
    total_rows: int,
    non_null: int,
    distinct: int,
    mn: float,
    mx: float,
    av: float,
    headers: dict[str, str],
) -> ColumnStats:
    """Build categorical stats for a low-cardinality numeric column.

    `non_null`, `distinct`, `mn`, `mx`, and `av` are exact aggregates already
    computed by the caller; the group-by supplies the top values by frequency for
    display (its most frequent group is also the mode). A number-backed categorical
    still carries a numeric summary so the UI can show min/avg/max/median/mode
    alongside the distinct-value breakdown.
    """
    groups = await _compute_groupby(client, soda_base, field, headers, limit=20)
    values = [
        _truncate_sample(str(g.get(field))) for g in groups if g.get(field) is not None
    ]
    value_counts = [int(g.get("cnt") or 0) for g in groups if g.get(field) is not None]

    stats: dict[str, Any] = {
        "count": non_null,
        "uniqueCount": distinct,
        "values": values,
        "valueCounts": value_counts,
        "hasMore": distinct > 20,
    }
    summary = await _numeric_categorical_summary(
        client, soda_base, field, non_null, mn, mx, av, groups, headers
    )
    if summary is not None:
        stats["numericSummary"] = summary

    return ColumnStats(
        type="categorical",
        baseType="numeric",
        stats=stats,
        nullCount=total_rows - non_null,
        totalCount=total_rows,
    )


async def _numeric_categorical_summary(
    client: httpx.AsyncClient,
    soda_base: str,
    field: str,
    non_null: int,
    mn: float,
    mx: float,
    av: float,
    groups: list[dict[str, Any]],
    headers: dict[str, str],
) -> dict[str, float] | None:
    """min/avg/max/median/mode for a number-backed categorical column.

    min/max/avg come from the caller's aggregate; the mode is the most frequent
    group (already sorted by count desc); the median is one ordered lookup at
    the middle offset — mirrors the numeric path's percentile fetch.
    """
    esc = soda_escape(field)
    median_offset = max(0, int(non_null * 0.5) - 1)
    rows = await soda_get(
        client,
        soda_base,
        {
            "$select": esc,
            "$where": f"{esc} IS NOT NULL",
            "$order": f"{esc} ASC",
            "$limit": "1",
            "$offset": str(median_offset),
        },
        headers,
    )
    try:
        median = float(rows[0][field]) if rows and field in rows[0] else mx
    except (TypeError, ValueError):
        median = mx

    mode = mn
    for g in groups:
        raw = g.get(field)
        if raw is None:
            continue
        try:
            mode = float(raw)
            break
        except (TypeError, ValueError):
            continue

    return {"min": mn, "avg": av, "max": mx, "median": median, "mode": mode}


async def _compute_temporal_stats(
    client: httpx.AsyncClient,
    soda_base: str,
    field: str,
    total_rows: int,
    headers: dict[str, str],
) -> ColumnStats:
    """Compute min/max/count for a date or timestamp column via a single SODA aggregate."""
    esc = soda_escape(field)
    rows = await soda_get(
        client,
        soda_base,
        {
            "$select": f"min({esc}) as mn, max({esc}) as mx, count({esc}) as cnt",
        },
        headers,
    )
    if not rows:
        return ColumnStats(
            type="empty", stats={}, nullCount=total_rows, totalCount=total_rows
        )
    row = rows[0]
    cnt = int(row.get("cnt") or 0)
    mn = row.get("mn")
    mx = row.get("mx")
    # cnt>0 but null bounds means the aggregate degenerated (rare — fall back to empty).
    if cnt == 0 or mn is None or mx is None:
        return ColumnStats(
            type="empty", stats={}, nullCount=total_rows, totalCount=total_rows
        )
    return ColumnStats(
        type="temporal",
        stats={"count": cnt, "min": str(mn), "max": str(mx)},
        nullCount=total_rows - cnt,
        totalCount=total_rows,
    )


async def _compute_non_null_count(
    client: httpx.AsyncClient,
    soda_base: str,
    field: str,
    headers: dict[str, str],
) -> int:
    esc = soda_escape(field)
    rows = await soda_get(
        client, soda_base, {"$select": f"count({esc}) as cnt"}, headers
    )
    if not rows:
        return 0
    return int(rows[0].get("cnt") or 0)


async def _compute_geospatial_stats(
    client: httpx.AsyncClient,
    soda_base: str,
    field: str,
    total_rows: int,
    headers: dict[str, str],
    geometry_type: str,
) -> ColumnStats:
    """Count non-null geometries. Skip group-by — geometries are near-unique
    and their WKT/JSON noise pollutes the prompt.

    Note: legacy `location` also carries `human_address`/`latitude`/`longitude`
    subfields. We drop them here for uniformity with the other geometry types;
    if the LLM ever needs address strings as prompt context, split `location`
    out and project `field.human_address`.
    """
    cnt = await _compute_non_null_count(client, soda_base, field, headers)
    if cnt == 0:
        return ColumnStats(
            type="empty", stats={}, nullCount=total_rows, totalCount=total_rows
        )
    return ColumnStats(
        type="geospatial",
        stats={"count": cnt, "geometryType": geometry_type},
        nullCount=total_rows - cnt,
        totalCount=total_rows,
    )


async def _compute_sampled_text_stats(
    client: httpx.AsyncClient,
    soda_base: str,
    field: str,
    total_rows: int,
    headers: dict[str, str],
) -> ColumnStats:
    """For flat near-unique text types (email, phone): count, distinct, samples.

    Empty strings are folded into the null count — SoQL would otherwise treat
    them as a distinct non-null value and surface a blank sample.
    """
    esc = soda_escape(field)
    non_empty = f"{esc} IS NOT NULL AND {esc} <> ''"
    agg_rows, sample_rows = await asyncio.gather(
        soda_get(
            client,
            soda_base,
            {
                "$select": f"count({esc}) as cnt, count(distinct {esc}) as ucnt",
                "$where": f"{esc} <> ''",
            },
            headers,
        ),
        soda_get(
            client,
            soda_base,
            {"$select": esc, "$where": non_empty, "$limit": "5"},
            headers,
        ),
    )
    agg = agg_rows[0] if agg_rows else {}
    cnt = int(agg.get("cnt") or 0)
    if cnt == 0:
        return ColumnStats(
            type="empty", stats={}, nullCount=total_rows, totalCount=total_rows
        )
    unique_count = _coerce_unique_count(agg.get("ucnt"), cnt, field)
    samples = [_truncate_sample(str(r[field])) for r in sample_rows if r.get(field)]
    return ColumnStats(
        type="text",
        stats={"count": cnt, "uniqueCount": unique_count, "samples": samples},
        nullCount=total_rows - cnt,
        totalCount=total_rows,
    )


async def _compute_url_stats(
    client: httpx.AsyncClient,
    soda_base: str,
    field: str,
    total_rows: int,
    headers: dict[str, str],
) -> ColumnStats:
    """URL columns are nested objects with `url` and `description` subfields.

    Project the subfields explicitly so distinct/sampling operate on the link
    string instead of the wrapping object (which would otherwise become an
    unreadable dict repr in the LLM prompt).
    """
    esc = soda_escape(field)
    url_expr = f"{esc}.url"
    desc_expr = f"{esc}.description"
    agg_rows, sample_rows = await asyncio.gather(
        soda_get(
            client,
            soda_base,
            {
                "$select": f"count({url_expr}) as cnt, count(distinct {url_expr}) as ucnt"
            },
            headers,
        ),
        soda_get(
            client,
            soda_base,
            {
                # Group by (url, description) — same url with two descriptions
                # yields two rows, which is fine for sampling (variety is
                # informative) and order-by-count surfaces the typical pairing.
                "$select": f"{url_expr} as link, {desc_expr} as label, count(*) as cnt",
                "$where": f"{url_expr} IS NOT NULL",
                "$group": f"{url_expr}, {desc_expr}",
                "$order": "cnt DESC",
                "$limit": "5",
            },
            headers,
        ),
    )
    agg = agg_rows[0] if agg_rows else {}
    cnt = int(agg.get("cnt") or 0)
    if cnt == 0:
        return ColumnStats(
            type="empty", stats={}, nullCount=total_rows, totalCount=total_rows
        )
    unique_count = _coerce_unique_count(agg.get("ucnt"), cnt, field)
    samples: list[str] = []
    for r in sample_rows:
        link = r.get("link")
        if not link:
            continue
        label = r.get("label")
        rendered = f"{link} ({label})" if label else str(link)
        samples.append(_truncate_sample(rendered))
    return ColumnStats(
        type="text",
        stats={"count": cnt, "uniqueCount": unique_count, "samples": samples},
        nullCount=total_rows - cnt,
        totalCount=total_rows,
    )


async def _compute_phone_stats(
    client: httpx.AsyncClient,
    soda_base: str,
    field: str,
    total_rows: int,
    headers: dict[str, str],
) -> ColumnStats:
    """Legacy `phone` columns are nested objects with `phone_number` and
    `phone_type` subfields. Project them so samples are readable strings
    (e.g. "555-1234 (mobile)") instead of dict reprs.
    """
    esc = soda_escape(field)
    num_expr = f"{esc}.phone_number"
    type_expr = f"{esc}.phone_type"
    agg_rows, sample_rows = await asyncio.gather(
        soda_get(
            client,
            soda_base,
            {
                "$select": f"count({num_expr}) as cnt, count(distinct {num_expr}) as ucnt",
            },
            headers,
        ),
        soda_get(
            client,
            soda_base,
            {
                "$select": f"{num_expr} as number, {type_expr} as kind, count(*) as cnt",
                "$where": f"{num_expr} IS NOT NULL",
                "$group": f"{num_expr}, {type_expr}",
                "$order": "cnt DESC",
                "$limit": "5",
            },
            headers,
        ),
    )
    agg = agg_rows[0] if agg_rows else {}
    cnt = int(agg.get("cnt") or 0)
    if cnt == 0:
        return ColumnStats(
            type="empty", stats={}, nullCount=total_rows, totalCount=total_rows
        )
    unique_count = _coerce_unique_count(agg.get("ucnt"), cnt, field)
    samples: list[str] = []
    for r in sample_rows:
        number = r.get("number")
        if not number:
            continue
        kind = r.get("kind")
        rendered = f"{number} ({kind})" if kind else str(number)
        samples.append(_truncate_sample(rendered))
    return ColumnStats(
        type="text",
        stats={"count": cnt, "uniqueCount": unique_count, "samples": samples},
        nullCount=total_rows - cnt,
        totalCount=total_rows,
    )


def _coerce_unique_count(raw: Any, cnt: int, field: str) -> int:
    """Parse a count(distinct …) result. Falls back to the non-null count
    (i.e. treats every non-null value as unique) when the aggregate is
    missing or zero — and logs a warning so the degraded path is observable
    (e.g. when an older SODA endpoint doesn't honor `count(distinct …)`)."""
    try:
        ucnt = int(raw) if raw is not None else 0
    except (TypeError, ValueError):
        ucnt = 0
    if ucnt > 0:
        return ucnt
    logger.warning(
        "count(distinct) returned %r for field %s (cnt=%d) — falling back to cnt",
        raw,
        field,
        cnt,
    )
    return cnt


async def _compute_opaque_stats(
    client: httpx.AsyncClient,
    soda_base: str,
    field: str,
    total_rows: int,
    headers: dict[str, str],
) -> ColumnStats:
    """For document/photo/dataset_link/nested_table: count only, no samples."""
    cnt = await _compute_non_null_count(client, soda_base, field, headers)
    if cnt == 0:
        return ColumnStats(
            type="empty", stats={}, nullCount=total_rows, totalCount=total_rows
        )
    return ColumnStats(
        type="opaque",
        stats={"count": cnt},
        nullCount=total_rows - cnt,
        totalCount=total_rows,
    )


async def _compute_count_and_distinct(
    client: httpx.AsyncClient,
    soda_base: str,
    field: str,
    headers: dict[str, str],
    extra_where: str = "",
) -> tuple[int, int]:
    """Return (non-null count, distinct count) for a field in one SODA aggregate.

    The distinct count is the column's *true* cardinality — unlike the length
    of a capped group-by — so callers can compute an accurate unique-ratio.

    `extra_where` lets text-like callers exclude empty strings (which SoQL
    treats as distinct from NULL) so they collapse into the null count.
    """
    esc = soda_escape(field)
    params: dict[str, str] = {
        "$select": f"count({esc}) as cnt, count(distinct {esc}) as ucnt"
    }
    if extra_where:
        params["$where"] = extra_where
    rows = await soda_get(client, soda_base, params, headers)
    if not rows:
        return 0, 0
    cnt = int(rows[0].get("cnt") or 0)
    if cnt == 0:
        return 0, 0
    return cnt, _coerce_unique_count(rows[0].get("ucnt"), cnt, field)


async def _compute_groupby(
    client: httpx.AsyncClient,
    soda_base: str,
    field: str,
    headers: dict[str, str],
    limit: int,
    extra_where: str = "",
) -> list[dict[str, Any]]:
    """Run a group-by query for a column. Returns up to `limit` groups sorted by count desc.

    `limit` is required and caller-chosen — the right value depends on what
    the caller is trying to decide (bounded categorical vs ambiguous text),
    and a one-size default would silently mismatch the caller's has_more
    threshold.

    `extra_where` is AND-ed with the IS NOT NULL filter — text-like callers
    use it to drop empty-string groups that SoQL otherwise treats as a
    distinct value.
    """
    esc = soda_escape(field)
    where = f"{esc} IS NOT NULL"
    if extra_where:
        where = f"{where} AND {extra_where}"
    return await soda_get(
        client,
        soda_base,
        {
            "$select": f"{esc}, count(*) as cnt",
            "$group": esc,
            "$order": "cnt DESC",
            "$limit": str(limit),
            "$where": where,
        },
        headers,
    )


def _classify_from_groupby(
    groups: list[dict[str, Any]],
    field: str,
    total_rows: int,
    non_null_count: int,
    distinct_count: int,
) -> ColumnStats:
    """Classify an ambiguous column as categorical or text from exact counts.

    `groups` (top values by frequency, from a capped group-by) supplies only
    the representative sample/value lists. The categorical-vs-text decision
    uses `non_null_count` and `distinct_count` — exact aggregates from the
    caller — never `len(groups)`, which reflects just the truncated group-by
    window and would make a high-cardinality text column look low-cardinality.

    Heuristic mirrors the frontend `analyzeColumn`: a low unique-ratio or a
    small absolute distinct count means categorical; otherwise text.
    """
    if non_null_count == 0:
        return ColumnStats(
            type="empty", stats={}, nullCount=total_rows, totalCount=total_rows
        )

    unique_ratio = distinct_count / non_null_count
    is_categorical = unique_ratio < 0.5 or distinct_count < TEXT_GROUPBY_LIMIT

    if not is_categorical:
        # Text column — use values from group-by (guaranteed non-null).
        samples = [
            _truncate_sample(_groupby_value_str(g.get(field)))
            for g in groups[:5]
            if g.get(field) is not None
        ]
        return ColumnStats(
            type="text",
            stats={
                "count": non_null_count,
                "uniqueCount": distinct_count,
                "samples": samples,
            },
            nullCount=total_rows - non_null_count,
            totalCount=total_rows,
        )

    top = groups[:20]
    values = [_truncate_sample(_groupby_value_str(g.get(field))) for g in top]
    value_counts = [int(g.get("cnt") or 0) for g in top]
    return ColumnStats(
        type="categorical",
        baseType="text",
        stats={
            "count": non_null_count,
            "uniqueCount": distinct_count,
            "values": values,
            "valueCounts": value_counts,
            "hasMore": distinct_count > 20,
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

    if data_type in TEMPORAL_SOCRATA_TYPES:
        stats = await _compute_temporal_stats(
            client, soda_base, field, total_rows, headers
        )
        return display_name, stats

    if data_type in GEOSPATIAL_SOCRATA_TYPES:
        stats = await _compute_geospatial_stats(
            client, soda_base, field, total_rows, headers, data_type
        )
        return display_name, stats

    if data_type == URL_SOCRATA_TYPE:
        stats = await _compute_url_stats(client, soda_base, field, total_rows, headers)
        return display_name, stats

    if data_type == PHONE_SOCRATA_TYPE:
        stats = await _compute_phone_stats(
            client, soda_base, field, total_rows, headers
        )
        return display_name, stats

    if data_type in SAMPLED_TEXT_SOCRATA_TYPES:
        stats = await _compute_sampled_text_stats(
            client, soda_base, field, total_rows, headers
        )
        return display_name, stats

    if data_type in OPAQUE_SOCRATA_TYPES:
        stats = await _compute_opaque_stats(
            client, soda_base, field, total_rows, headers
        )
        return display_name, stats

    if data_type in CATEGORICAL_SOCRATA_TYPES:
        # Fetch limit+1 so we can tell "exactly limit" apart from "more than limit"
        # — otherwise a column with exactly CATEGORICAL_BOUNDED_LIMIT distinct
        # values would falsely report hasMore=True.
        # Run the count(field) aggregate in parallel rather than summing the
        # truncated group counts — the sum undercounts whenever has_more is true.
        groups, non_null = await asyncio.gather(
            _compute_groupby(
                client, soda_base, field, headers, limit=CATEGORICAL_BOUNDED_LIMIT + 1
            ),
            _compute_non_null_count(client, soda_base, field, headers),
        )
        has_more = len(groups) > CATEGORICAL_BOUNDED_LIMIT
        groups = groups[:CATEGORICAL_BOUNDED_LIMIT]
        values = [_truncate_sample(_groupby_value_str(g.get(field))) for g in groups]
        value_counts = [int(g.get("cnt") or 0) for g in groups]
        unique_count = len(groups)
        return display_name, ColumnStats(
            type="categorical",
            baseType="text",
            stats={
                "count": non_null,
                "uniqueCount": unique_count,
                "values": values,
                "valueCounts": value_counts,
                "hasMore": has_more,
            },
            nullCount=total_rows - non_null,
            totalCount=total_rows,
        )

    # Ambiguous type (plain text, html, etc.) — classify by true cardinality.
    # The group-by supplies representative values; count + count(distinct) — a
    # separate aggregate fetched in parallel — give the exact non-null and
    # distinct counts. The real distinct count is essential: len(groups) is
    # capped by the group-by limit, so a high-cardinality text column would
    # otherwise look low-cardinality and be misclassified as categorical.
    # Empty strings are treated as missing: SoQL counts them as non-null and
    # groups them as a distinct value, so without this filter blank cells
    # surface as a blank pill in Sample Values.
    esc = soda_escape(field)
    empty_filter = f"{esc} <> ''"
    groups, (non_null, distinct) = await asyncio.gather(
        _compute_groupby(
            client,
            soda_base,
            field,
            headers,
            limit=TEXT_GROUPBY_LIMIT,
            extra_where=empty_filter,
        ),
        _compute_count_and_distinct(
            client,
            soda_base,
            field,
            headers,
            extra_where=empty_filter,
        ),
    )
    stats = _classify_from_groupby(groups, field, total_rows, non_null, distinct)
    return display_name, stats
