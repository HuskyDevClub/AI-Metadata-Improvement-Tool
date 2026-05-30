Determine the most accurate and concise Row Label for this government dataset. The Row Label should describe what a single row represents in plain language.

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

Rules:
- The Row Label should be a short noun phrase (1-4 words) that describes what ONE row in the dataset represents.
- Use plain language — no jargon, no acronyms unless universally understood.
- Examples of good row labels: "license record", "traffic incident", "employee", "inspection result", "school enrollment record", "water quality sample"
- Do NOT include the dataset name or agency name in the row label.
- Do NOT use articles ("a", "an", "the").
- Do NOT add punctuation or capitalization beyond the first word.

Return ONLY the row label text — nothing else.
