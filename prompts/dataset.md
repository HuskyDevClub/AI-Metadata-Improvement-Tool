Generate a Brief Description for this government dataset following plain-language metadata guidance. The description should be approximately 100 words.

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

An existing description may be provided below for REFERENCE only. A human wrote it; it may be accurate, outdated, incomplete, or low quality. Use it ONLY for real-world context you could not infer from the data itself — the meaning of acronyms, collection methodology, program or agency names, and known caveats. Do NOT copy its wording, do NOT inherit its errors or unsupported claims, and when it conflicts with the data, trust the data.
<<<UNTRUSTED_DATA>>>
{existingDescription}
<<<END_UNTRUSTED_DATA>>>

Your description MUST cover these elements in order:
1. CONTENT & SIGNIFICANCE (first 2 sentences): What data this dataset contains, what each row represents, and why this data matters to the public.
2. KEY FIELDS: Highlight the most important columns and what kind of information they provide. Reference specific values from the sample data when helpful.
3. SCOPE: The geographic and/or temporal coverage, if inferable from the data.
4. POTENTIAL USERS: Briefly note who would use this data (residents, researchers, journalists, businesses, agencies, etc.) and for what purpose.

GROUNDING (required): Base every claim on the columns and sample data above. Where the data does not support a statement about significance, scope, or audience, keep it general and clearly hedged rather than inventing specific facts, figures, dates, or geographic coverage. It is better to say less than to assert something the data does not show.

FORMAT RULES:
- Write as a single cohesive paragraph (no bullet points, no headers)
- Do not start with "This dataset contains..." — vary your opening
- Do not include row counts or technical statistics in the description
- Expand all acronyms found in column names or data values
