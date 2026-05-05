"""Audit metadata completeness for datasets on data.wa.gov.

Queries the Socrata Discovery API and counts how many datasets are missing
key metadata fields (description, tags, category, attribution, contact email).

Usage:
    python audit_metadata.py                # print summary
    python audit_metadata.py --csv out.csv  # also write per-dataset CSV
    python audit_metadata.py --domain data.wa.gov --csv out.csv
"""

import argparse
import csv
import json
import re
import sys
import urllib.request


# Socrata Discovery API. `domains` filters by host; `search_context` makes
# domain-specific custom metadata fields visible in the response.
CATALOG_URL = "https://{domain}/api/catalog/v1"


def strip_html(s: str | None) -> str:
    # Descriptions on Socrata are often HTML (<p>, <br>). Strip tags so a
    # description that's just "<p></p>" or " " correctly counts as empty.
    return re.sub(r"<[^>]+>", "", s or "").strip()


def fetch_catalog(domain: str) -> list[dict]:
    """Page through the catalog API until every dataset is collected."""
    results: list[dict] = []
    offset = 0
    page = 1000  # Socrata caps `limit` at 10000; 1000 is a safe, fast page size.
    while True:
        url = (
            f"{CATALOG_URL.format(domain=domain)}"
            f"?domains={domain}&search_context={domain}"
            f"&only=datasets&limit={page}&offset={offset}"
        )
        with urllib.request.urlopen(url, timeout=60) as resp:
            data = json.load(resp)
        batch = data.get("results", [])
        results.extend(batch)
        # `resultSetSize` is the total match count — stop once we've fetched
        # them all, or if the API returns an empty page (defensive).
        total = data.get("resultSetSize", len(results))
        if len(results) >= total or not batch:
            break
        offset += page
    return results


def audit(rows: list[dict]) -> tuple[dict, list[dict]]:
    """Return (aggregate counts, per-dataset detail rows)."""
    counts = {
        "total": len(rows),
        "missing_description": 0,
        "missing_tags": 0,
        "missing_category": 0,
        "missing_attribution": 0,
        "missing_contact_email": 0,
        "missing_all_core": 0,  # description AND tags AND category all empty
    }
    detail: list[dict] = []
    for r in rows:
        # Catalog payload splits fields between `resource` (core asset
        # metadata) and `classification` (tags / category / custom fields).
        res = r.get("resource", {}) or {}
        cls = r.get("classification", {}) or {}

        desc = strip_html(res.get("description"))
        # `domain_tags` is the per-domain tag list users actually edit;
        # `tags` is the global fallback. Treat either as "has tags".
        tags = cls.get("domain_tags") or cls.get("tags") or []
        category = cls.get("domain_category")
        attribution = (res.get("attribution") or "").strip()
        email = (res.get("contact_email") or "").strip()

        miss_desc = not desc
        miss_tags = not tags
        miss_cat = not category
        miss_attr = not attribution
        miss_email = not email

        counts["missing_description"] += miss_desc
        counts["missing_tags"] += miss_tags
        counts["missing_category"] += miss_cat
        counts["missing_attribution"] += miss_attr
        counts["missing_contact_email"] += miss_email
        if miss_desc and miss_tags and miss_cat:
            counts["missing_all_core"] += 1

        detail.append(
            {
                "id": res.get("id"),
                "name": res.get("name"),
                "permalink": r.get("permalink"),
                "missing_description": miss_desc,
                "missing_tags": miss_tags,
                "missing_category": miss_cat,
                "missing_attribution": miss_attr,
                "missing_contact_email": miss_email,
            }
        )
    return counts, detail


def print_summary(counts: dict) -> None:
    # Avoid divide-by-zero when the catalog is empty.
    total = counts["total"] or 1

    def pct(n: int) -> str:
        return f"{n / total * 100:.1f}%"

    print(f"Total datasets: {counts['total']}")
    print(
        f"  Missing description:   {counts['missing_description']:>5} ({pct(counts['missing_description'])})"
    )
    print(
        f"  Missing tags:          {counts['missing_tags']:>5} ({pct(counts['missing_tags'])})"
    )
    print(
        f"  Missing category:      {counts['missing_category']:>5} ({pct(counts['missing_category'])})"
    )
    print(
        f"  Missing attribution:   {counts['missing_attribution']:>5} ({pct(counts['missing_attribution'])})"
    )
    print(
        f"  Missing contact email: {counts['missing_contact_email']:>5} ({pct(counts['missing_contact_email'])})"
    )
    print(
        f"  Missing desc+tags+cat: {counts['missing_all_core']:>5} ({pct(counts['missing_all_core'])})"
    )


def write_csv(path: str, detail: list[dict]) -> None:
    fields = list(detail[0].keys()) if detail else []
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(detail)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--domain",
        default="data.wa.gov",
        help="Socrata portal hostname (default: data.wa.gov)",
    )
    p.add_argument("--csv", help="write per-dataset audit to this CSV path")
    p.add_argument(
        "--only-missing",
        action="store_true",
        help="when writing CSV, only include datasets missing at least one field",
    )
    args = p.parse_args()

    rows = fetch_catalog(args.domain)
    counts, detail = audit(rows)
    print_summary(counts)

    if args.csv:
        out = detail
        if args.only_missing:
            # Keep only rows where any audited field is empty.
            out = [
                d for d in detail if any(d[k] for k in d if k.startswith("missing_"))
            ]
        write_csv(args.csv, out)
        print(f"\nWrote {len(out)} rows to {args.csv}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
