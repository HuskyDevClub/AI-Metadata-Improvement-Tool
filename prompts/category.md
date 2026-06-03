Pick the single best Category for this government dataset. You MUST choose exactly one entry from the numbered list below.

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

Allowed categories (TRUSTED — choose EXACTLY ONE by number):
{categoryList}

Rules:
- Return ONLY the number (e.g., 3) of the single best-fit category from the list above. No text, no punctuation, no explanation.
- If the dataset could plausibly fit multiple categories, choose the one that best reflects the primary subject of the data (what each row is about), not a secondary attribute.
- If no category fits well, still pick the closest one by number — you MUST return a valid index.

Return ONLY the number — nothing else.
