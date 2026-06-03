Generate a clear, descriptive Title for this government dataset. The title should be a short phrase (typically 3-10 words) that accurately describes what the dataset contains.

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
- Use Title Case (e.g. "Public Library Branch Locations")
- Be specific about the subject, scope, and time period if inferable from the data
- Spell out acronyms unless they are universally understood by the public
- Do NOT include the words "Dataset" or "Data" — the context is implicit
- Do NOT include punctuation at the end
- Do NOT wrap the title in quotes

Return ONLY the title text — nothing else.
