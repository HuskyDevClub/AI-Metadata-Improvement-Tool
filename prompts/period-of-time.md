Determine the Period of Time covered by this government dataset. This describes the real-world time span the data represents (not when the dataset was last updated).

Dataset Name: {fileName}
Number of Rows: {rowCount}

Columns (name — type) — untrusted, from the dataset:
<<<UNTRUSTED_DATA>>>
{columnInfo}
<<<END_UNTRUSTED_DATA>>>

Sample Data (first {sampleCount} rows) — untrusted, from the dataset:
<<<UNTRUSTED_DATA>>>
{sampleRows}
<<<END_UNTRUSTED_DATA>>>

{temporalSummary}

Output format:
Return ONLY a single JSON object on one line with two keys, "start" and "end". No prose, no code fences, no labels.

Precision: only the YEAR is required. Month and day are optional — include them ONLY when the sample data clearly and unambiguously supports that precision. When in doubt, return less precision rather than guessing.

Allowed values for "start":
- "YYYY" (year only, e.g. "2013") — preferred default; use this when the data spans full calendar years, or when month/day are unclear, inconsistent, or only partially populated
- "YYYY-MM" (year and month) — use only when every dated record cleanly aligns to a known month, AND the start month is not just "January by default"
- "YYYY-MM-DD" (year, month, and day) — use only when the data has a clear, specific start date (e.g. a single launch date, a defined fiscal period boundary)

Allowed values for "end":
- Any of the formats above (same precision rules), OR
- "present" — use this if the dataset is kept current and includes recent records

Rules:
- Ground your answer in the detected date/year ranges shown above. Do NOT report a start earlier, or a concrete end later, than those ranges support.
- If the most recent date in the data is within about the last year of today, set "end" to "present" instead of that specific trailing date — the data is being kept current.
- Default to year-only ("YYYY") unless the data gives strong evidence for finer precision. It is better to under-report precision than to invent a specific month or day.
- Do NOT promote year-level data to month- or day-level just because the data type is a date — for example, if records are timestamped 2020-01-01, 2021-01-01, 2022-01-01, those are yearly snapshots; return "2020" and "2022", not "2020-01-01" and "2022-01-01".
- Do NOT guess dates that are not supported by the data. If you are unsure, widen to year-only or return empty rather than inventing precision.
- Do NOT include update cadence — that belongs in Posting Frequency.
- If no date or year fields were detected and no time scope can be inferred, return {"start": "", "end": ""}. An empty result is better than a fabricated one.

Example outputs:
{"start": "2013", "end": "present"}
{"start": "2018", "end": "2024"}
{"start": "2020-01", "end": "2023-12"}
{"start": "2026-03-31", "end": "2026-03-31"}
