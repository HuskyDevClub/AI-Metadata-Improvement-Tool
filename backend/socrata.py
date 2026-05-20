import asyncio
import logging
import time
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response

from .auth import read_session, require_xhr_header
from .config import (
    COOKIE_SAMESITE,
    COOKIE_SECURE,
    DOMAIN_COOKIE_MAX_AGE,
    SOCRATA_CATALOG_DOMAIN,
    SOCRATA_DOMAIN,
    SOCRATA_DOMAIN_COOKIE_NAME,
    is_valid_socrata_domain,
    normalize_socrata_domain,
    resolve_socrata_domain,
    socrata_base_url,
)
from .models import (
    ColumnStats,
    SocrataCategoriesResponse,
    SocrataColumnMetadata,
    SocrataConfigResponse,
    SocrataDomainRequest,
    SocrataExportRequest,
    SocrataExportResponse,
    SocrataImportRequest,
    SocrataImportResponse,
    SocrataLicenseInfo,
    SocrataLicensesResponse,
    SocrataTagsResponse,
)
from .socrata_soda import build_socrata_auth, compute_column_stats, soda_get

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/socrata")

# Live catalog caches. Each portal advertises its own categories/tags/licenses,
# so every cache is keyed by domain (tags additionally by category). Entries are
# {"value": ..., "fetched_at": float}; populated lazily, refreshed after TTL.
_categories_cache: dict[str, dict[str, Any]] = {}
_CATEGORIES_TTL_SECONDS = 24 * 60 * 60

_licenses_cache: dict[str, dict[str, Any]] = {}
_LICENSES_TTL_SECONDS = 24 * 60 * 60

_tags_cache: dict[tuple[str, str], dict[str, Any]] = {}
_TAGS_TTL_SECONDS = 24 * 60 * 60
_TAGS_MAX_RETURN = 2000


@router.get("/config", response_model=SocrataConfigResponse)
async def socrata_config(request: Request) -> SocrataConfigResponse:
    """Return the portal domain in effect (per-user override or server default)."""
    return SocrataConfigResponse(
        domain=resolve_socrata_domain(request),
        defaultDomain=SOCRATA_DOMAIN,
    )


@router.put(
    "/config",
    response_model=SocrataConfigResponse,
    dependencies=[Depends(require_xhr_header)],
)
async def set_socrata_config(
    body: SocrataDomainRequest, response: Response
) -> SocrataConfigResponse:
    """Set or clear the per-user Socrata portal override.

    An empty domain clears the override and reverts to the server default. The
    chosen value is normalized (scheme/path stripped) and validated as a bare
    hostname before being stored in a long-lived cookie.
    """
    raw = (body.domain or "").strip()
    if not raw:
        response.delete_cookie(SOCRATA_DOMAIN_COOKIE_NAME, path="/")
        return SocrataConfigResponse(
            domain=SOCRATA_DOMAIN, defaultDomain=SOCRATA_DOMAIN
        )

    domain = normalize_socrata_domain(raw)
    if not is_valid_socrata_domain(domain):
        raise HTTPException(
            status_code=400,
            detail="Enter a valid portal domain, e.g. data.wa.gov.",
        )
    response.set_cookie(
        SOCRATA_DOMAIN_COOKIE_NAME,
        domain,
        max_age=DOMAIN_COOKIE_MAX_AGE,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
    )
    return SocrataConfigResponse(domain=domain, defaultDomain=SOCRATA_DOMAIN)


@router.post("/import", response_model=SocrataImportResponse)
async def socrata_import(
    request: SocrataImportRequest, http_request: Request
) -> SocrataImportResponse:
    if not request.datasetId or not request.datasetId.strip():
        raise HTTPException(status_code=400, detail="Dataset ID is required")

    dataset_id = request.datasetId.strip()
    domain = resolve_socrata_domain(http_request)
    base_url = socrata_base_url(domain)
    session = read_session(http_request)
    headers = build_socrata_auth(session)

    metadata_url = f"{base_url}/api/views/{dataset_id}.json"
    soda_base = f"{base_url}/resource/{dataset_id}.json"

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            # Phase 1: metadata + row count + sample rows (parallel)
            metadata_resp, count_rows, sample_rows = await asyncio.gather(
                client.get(metadata_url, headers=headers),
                soda_get(client, soda_base, {"$select": "count(*) as total"}, headers),
                soda_get(client, soda_base, {"$limit": "10"}, headers),
            )

            if metadata_resp.status_code != 200:
                raise HTTPException(
                    status_code=metadata_resp.status_code,
                    detail=f"Failed to fetch dataset metadata: {metadata_resp.reason_phrase}",
                )

            metadata = metadata_resp.json()
            dataset_name = metadata.get("name") or dataset_id
            dataset_description = metadata.get("description") or ""

            nested_metadata = metadata.get("metadata") or {}
            if not isinstance(nested_metadata, dict):
                nested_metadata = {}

            row_label = (
                nested_metadata.get("rowLabel", "")
                or metadata.get("rowLabel", "")
                or ""
            )
            category = metadata.get("category") or ""
            raw_tags = metadata.get("tags")
            if isinstance(raw_tags, list):
                tags = [str(t) for t in raw_tags if t]
            else:
                tags = []

            license_id = metadata.get("licenseId") or ""
            attribution = metadata.get("attribution") or ""

            contact_email = nested_metadata.get("contactEmail") or ""

            custom_fields = nested_metadata.get("custom_fields") or {}
            if not isinstance(custom_fields, dict):
                custom_fields = {}
            temporal_fields = custom_fields.get("Temporal") or {}
            if not isinstance(temporal_fields, dict):
                temporal_fields = {}
            period_of_time = str(temporal_fields.get("Period of Time") or "")
            posting_frequency = str(temporal_fields.get("Posting Frequency") or "")

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
                compute_column_stats(client, soda_base, col, total_rows, headers)
                for col in columns
            ]
            stats_results = await asyncio.gather(*stats_tasks, return_exceptions=True)

            column_stats: dict[str, ColumnStats] = {}
            display_counts: dict[str, int] = {}
            field_to_display: dict[str, str] = {}

            for col, result in zip(columns, stats_results):
                base_display = col.name or col.fieldName
                count = display_counts.get(base_display, 0)
                if count > 0:
                    display_name = f"{base_display} ({count})"
                else:
                    display_name = base_display
                display_counts[base_display] = count + 1

                field_to_display[col.fieldName] = display_name

                if isinstance(result, BaseException):
                    logger.warning("Column stats computation failed: %s", result)
                    continue

                _, col_stats = result
                column_stats[display_name] = col_stats

            # Remap sample row keys from fieldName to displayName

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
                licenseId=license_id,
                attribution=attribution,
                contactEmail=contact_email,
                periodOfTime=period_of_time,
                postingFrequency=posting_frequency,
                columns=columns,
                columnStats=column_stats,
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Socrata import error")
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch from {domain}: {str(e)}"
        )


@router.post(
    "/export",
    response_model=SocrataExportResponse,
    dependencies=[Depends(require_xhr_header)],
)
async def socrata_export(
    request: SocrataExportRequest, http_request: Request
) -> SocrataExportResponse:
    if not request.datasetId or not request.datasetId.strip():
        raise HTTPException(status_code=400, detail="Dataset ID is required")

    dataset_id = request.datasetId.strip()
    domain = resolve_socrata_domain(http_request)
    session = read_session(http_request)

    # Write operations require authentication — OAuth or API key
    if not session or session.get("kind") not in ("oauth", "api_key"):
        raise HTTPException(
            status_code=401,
            detail=f"Authentication required to update metadata on {domain}. "
            "Please sign in with OAuth or save an API key.",
        )

    headers = build_socrata_auth(session)
    headers["Content-Type"] = "application/json"

    metadata_url = f"{socrata_base_url(domain)}/api/views/{dataset_id}.json"

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
            existing_metadata = current_metadata.get("metadata") or {}
            if not isinstance(existing_metadata, dict):
                existing_metadata = {}

            if request.datasetTitle is not None:
                update_payload["name"] = request.datasetTitle

            if request.datasetDescription is not None:
                update_payload["description"] = request.datasetDescription

            if request.category is not None:
                update_payload["category"] = request.category

            if request.tags is not None:
                # Append the AI-Metadata-Tool tag for auditability if any metadata is changed
                tags = list(request.tags)
                if "AI-Metadata-Tool" not in tags:
                    tags.append("AI-Metadata-Tool")
                update_payload["tags"] = tags
            elif (
                any(
                    v is not None
                    for v in (
                        request.datasetTitle,
                        request.datasetDescription,
                        request.category,
                        request.rowLabel,
                        request.licenseId,
                        request.attribution,
                        request.contactEmail,
                        request.periodOfTime,
                        request.postingFrequency,
                    )
                )
                or request.columns
            ):
                # If tags weren't provided in the request but other things were,
                # try to preserve existing tags and add our tool tag.
                existing_tags = current_metadata.get("tags") or []
                if (
                    isinstance(existing_tags, list)
                    and "AI-Metadata-Tool" not in existing_tags
                ):
                    update_payload["tags"] = existing_tags + ["AI-Metadata-Tool"]

            if request.licenseId is not None:
                update_payload["licenseId"] = request.licenseId

            if request.attribution is not None:
                update_payload["attribution"] = request.attribution

            metadata_changed = False

            if request.rowLabel is not None:
                existing_metadata["rowLabel"] = request.rowLabel
                metadata_changed = True

            if request.contactEmail is not None:
                existing_metadata["contactEmail"] = request.contactEmail
                metadata_changed = True

            if request.periodOfTime is not None or request.postingFrequency is not None:
                existing_custom = existing_metadata.get("custom_fields") or {}
                if not isinstance(existing_custom, dict):
                    existing_custom = {}
                existing_temporal = existing_custom.get("Temporal") or {}
                if not isinstance(existing_temporal, dict):
                    existing_temporal = {}
                if request.periodOfTime is not None:
                    existing_temporal["Period of Time"] = request.periodOfTime
                if request.postingFrequency is not None:
                    existing_temporal["Posting Frequency"] = request.postingFrequency
                existing_custom["Temporal"] = existing_temporal
                existing_metadata["custom_fields"] = existing_custom
                metadata_changed = True

            if metadata_changed:
                update_payload["metadata"] = existing_metadata

            # Merge column metadata updates into existing columns
            updated_col_count = 0
            renamed_field_count = 0
            renamed_display_count = 0
            if request.columns:
                update_map = {c.fieldName: c for c in request.columns}
                updated_columns = []
                for col in current_metadata.get("columns", []):
                    field_name = col.get("fieldName", "")
                    if field_name in update_map:
                        update = update_map[field_name]
                        col_changed = False
                        if update.description is not None:
                            col["description"] = update.description
                            col_changed = True
                        if update.name is not None and update.name != col.get("name"):
                            col["name"] = update.name
                            renamed_display_count += 1
                            col_changed = True
                        if (
                            update.newFieldName is not None
                            and update.newFieldName != field_name
                        ):
                            col["fieldName"] = update.newFieldName
                            renamed_field_count += 1
                            col_changed = True
                        if col_changed:
                            updated_col_count += 1
                    updated_columns.append(col)
                # Only include columns in the PUT if something actually changed —
                # otherwise we'd push every column back unchanged and produce a
                # message with no parts ("Successfully updated  on …").
                if updated_col_count > 0:
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
                    detail=f"Failed to update metadata on {domain}: {error_detail}",
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
                final_tag_count = len(update_payload.get("tags", []))
                parts.append(
                    f"{final_tag_count} tag{'s' if final_tag_count != 1 else ''}"
                )
            if request.licenseId is not None:
                parts.append("license")
            if request.attribution is not None:
                parts.append("attribution")
            if request.contactEmail is not None:
                parts.append("contact email")
            if request.periodOfTime is not None:
                parts.append("period of time")
            if request.postingFrequency is not None:
                parts.append("posting frequency")
            if updated_col_count > 0:
                parts.append(
                    f"{updated_col_count} column{'s' if updated_col_count != 1 else ''}"
                )
            if renamed_display_count > 0:
                parts.append(
                    f"{renamed_display_count} display name{'s' if renamed_display_count != 1 else ''} renamed"
                )
            if renamed_field_count > 0:
                parts.append(
                    f"{renamed_field_count} API field name{'s' if renamed_field_count != 1 else ''} renamed"
                )
            message = f"Successfully updated {' and '.join(parts)} on {domain}."

            return SocrataExportResponse(
                success=True,
                message=message,
                updatedColumns=updated_col_count,
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Socrata export error")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to push metadata to {domain}: {str(e)}",
        )


async def _fetch_socrata_categories(domain: str) -> list[str]:
    """Fetch the live domain category list from Socrata's public catalog API."""
    url = f"https://{SOCRATA_CATALOG_DOMAIN}/api/catalog/v1/domain_categories"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, params={"domains": domain})
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


async def _fetch_socrata_licenses(domain: str) -> list[SocrataLicenseInfo]:
    """Fetch the live license list from the given Socrata portal."""
    url = f"{socrata_base_url(domain)}/api/licenses.json"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()

    licenses: list[SocrataLicenseInfo] = []
    seen: set[str] = set()
    for entry in data or []:
        if not isinstance(entry, dict):
            continue
        lic_id = str(entry.get("id") or "").strip()
        name = str(entry.get("name") or "").strip()
        if not lic_id or not name or lic_id in seen:
            continue
        seen.add(lic_id)
        terms = entry.get("termsLink")
        licenses.append(
            SocrataLicenseInfo(
                id=lic_id,
                name=name,
                termsLink=str(terms) if terms else None,
            )
        )
    licenses.sort(key=lambda lic: lic.name.casefold())
    return licenses


@router.get("/licenses", response_model=SocrataLicensesResponse)
async def socrata_licenses(request: Request) -> SocrataLicensesResponse:
    """Return the live list of portal licenses, cached for 24 hours per domain."""
    domain = resolve_socrata_domain(request)
    now = time.time()
    cached = _licenses_cache.get(domain)

    if cached and (now - cached["fetched_at"]) < _LICENSES_TTL_SECONDS:
        return SocrataLicensesResponse(licenses=cached["value"])

    try:
        licenses = await _fetch_socrata_licenses(domain)
    except Exception as e:
        logger.warning("Failed to fetch Socrata licenses: %s", e)
        if cached:
            return SocrataLicensesResponse(licenses=cached["value"])
        raise HTTPException(
            status_code=503,
            detail=f"Could not reach {domain} to load licenses.",
        )

    _licenses_cache[domain] = {"value": licenses, "fetched_at": now}
    return SocrataLicensesResponse(licenses=licenses)


@router.get("/categories", response_model=SocrataCategoriesResponse)
async def socrata_categories(request: Request) -> SocrataCategoriesResponse:
    """Return the live list of portal categories, cached for 24 hours per domain."""
    domain = resolve_socrata_domain(request)
    now = time.time()
    cached = _categories_cache.get(domain)

    if cached and (now - cached["fetched_at"]) < _CATEGORIES_TTL_SECONDS:
        return SocrataCategoriesResponse(categories=cached["value"])

    try:
        categories = await _fetch_socrata_categories(domain)
    except Exception as e:
        logger.warning("Failed to fetch Socrata categories: %s", e)
        if cached:
            return SocrataCategoriesResponse(categories=cached["value"])
        raise HTTPException(
            status_code=503,
            detail="Could not reach Socrata catalog API to load categories.",
        )

    _categories_cache[domain] = {"value": categories, "fetched_at": now}
    return SocrataCategoriesResponse(categories=categories)


async def _fetch_socrata_tags(domain: str, category: str = "") -> list[str]:
    """Fetch the live tag list from Socrata's catalog, optionally scoped to a category.

    Returns tags sorted by descending usage count, capped at _TAGS_MAX_RETURN.
    """
    url = f"https://{SOCRATA_CATALOG_DOMAIN}/api/catalog/v1/domain_tags"
    # Socrata's catalog API defaults to a 100-row page; request the full set so the
    # autocomplete list matches what the portal surfaces.
    params: dict[str, str] = {"domains": domain, "limit": "10000"}
    if category:
        params["categories"] = category
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()

    results = data.get("results") or []
    pairs: list[tuple[str, int]] = []
    seen: set[str] = set()
    for entry in results:
        raw = entry.get("domain_tag") or entry.get("tag")
        if not raw:
            continue
        name = str(raw).strip().lower()
        if not name or name in seen:
            continue
        seen.add(name)
        try:
            count = int(entry.get("count") or 0)
        except (TypeError, ValueError):
            count = 0
        pairs.append((name, count))
    pairs.sort(key=lambda p: (-p[1], p[0]))
    return [name for name, _ in pairs[:_TAGS_MAX_RETURN]]


@router.get("/tags", response_model=SocrataTagsResponse)
async def socrata_tags(request: Request, category: str = "") -> SocrataTagsResponse:
    """Return the live list of portal tags, optionally scoped to a category.

    Cached for 24 hours per (domain, category).
    """
    domain = resolve_socrata_domain(request)
    key = (domain, category.strip())
    now = time.time()
    entry = _tags_cache.get(key)
    if entry and (now - entry["fetched_at"]) < _TAGS_TTL_SECONDS:
        return SocrataTagsResponse(tags=entry["value"])

    try:
        tags = await _fetch_socrata_tags(domain, key[1])
    except Exception as e:
        logger.warning("Failed to fetch Socrata tags (key=%r): %s", key, e)
        if entry is not None:
            return SocrataTagsResponse(tags=entry["value"])
        raise HTTPException(
            status_code=503,
            detail="Could not reach Socrata catalog API to load tags.",
        )

    _tags_cache[key] = {"value": tags, "fetched_at": now}
    return SocrataTagsResponse(tags=tags)
