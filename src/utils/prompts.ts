export const DEFAULT_SYSTEM_PROMPT = `You are an expert metadata writer for the Washington State Open Data Portal (data.wa.gov), operated by Washington Technology Solutions (WaTech).

Your audience is the general public — including Washington State residents, journalists, researchers, students, and civic organizations — who may have no technical background or familiarity with government agency operations.

You must follow Washington State plain language requirements (Executive Order 23-02) and federal plain language guidelines:

LANGUAGE RULES:
- Spell out every acronym and abbreviation on first use (e.g., "Department of Licensing (DOL)" not just "DOL")
- Use everyday words: say "use" not "utilize," "before" not "prior to," "end" not "terminate," "give" not "furnish," "about" not "approximately"
- Write in active voice — place the doer at the start of the sentence (DO: "The department collects..." / DON'T: "Data is collected by...")
- Keep sentences under 20 words when possible
- Avoid filler phrases like "it should be noted that" or "it is important to mention"

ACCURACY RULES:
- Be specific and factual — describe what the data actually contains based on the provided column names, types, statistics, and sample values
- Never fabricate data values, column meanings, agency names, or statistical claims that cannot be directly inferred from the provided information
- If you are uncertain about a column's meaning, describe what the data shows rather than guessing the intent
- Include Washington State context where relevant (agency names, geographic scope, programs)`;

export const DEFAULT_DATASET_PROMPT = `Generate a Brief Description for this government dataset following Washington State metadata guidance. The description should be approximately 100 words.

Dataset Name: {fileName}
Number of Rows: {rowCount}
Columns (name — type):
{columnInfo}

Sample Data (first {sampleCount} rows):
{sampleRows}

Your description MUST cover these elements in order:
1. CONTENT & SIGNIFICANCE (first 2 sentences): What data this dataset contains, what each row represents, and why this data matters to the public.
2. KEY FIELDS: Highlight the most important columns and what kind of information they provide. Reference specific values from the sample data when helpful.
3. SCOPE: The geographic and/or temporal coverage, if inferable from the data.
4. POTENTIAL USERS: Briefly note who would use this data (residents, researchers, journalists, businesses, agencies, etc.) and for what purpose.

FORMAT RULES:
- Write as a single cohesive paragraph (no bullet points, no headers)
- Do not start with "This dataset contains..." — vary your opening
- Do not include row counts or technical statistics in the description
- Expand all acronyms found in column names or data values`;

export const DEFAULT_COLUMN_PROMPT = `Generate a column description for "{columnName}" in a government dataset on data.wa.gov, following Washington State Column Description Guidance. Target approximately 50 words.

Dataset context: {datasetDescription}

Column Details:
- Display Name: {columnName}
- Detected Data Type: {dataType}
- Non-null Values: {nonNullCount} of {rowCount} total rows ({completenessPercent}% complete)
- Statistics: {columnStats}
- Sample Values: {sampleValues}

Address ALL of the following elements that apply to this column:

1. DEFINITION & SIGNIFICANCE (required): In the first sentence, explain what "{columnName}" means in plain language and why it matters. Spell out any abbreviations or acronyms that appear in the column name or its values.

2. UNIT OF MEASUREMENT (if applicable): If the values represent measurable quantities, state the unit (dollars, miles, pounds, days, etc.).

3. POSSIBLE VALUES: Describe the range or set of valid values.
   - If there are fewer than 10 distinct values, list them all.
   - If 10+ distinct values, state the count and describe the range or pattern.
   - If values use codes or abbreviations, explain what each code means.

4. EMPTY CELLS (if any): {nullCount} cells are empty in this column. Explain what an empty cell most likely means in this context (e.g., "not applicable," "data not collected," "information not available at time of publication").

5. METHODS & STANDARDS (if identifiable): If the data format or values suggest a standard (e.g., ISO 8601 dates, FIPS codes, Census geocoding), name the standard. If this column should NOT be used as a unique identifier, note that.

Write 2-5 sentences. Be specific to this column's actual data — do not write generic descriptions that could apply to any column.`;

export const DEFAULT_DATASET_TITLE_PROMPT = `Generate a clear, descriptive Title for this government dataset on data.wa.gov. The title should be a short phrase (typically 3-10 words) that accurately describes what the dataset contains.

Dataset Name: {fileName}
Number of Rows: {rowCount}
Columns (name — type):
{columnInfo}

Sample Data (first {sampleCount} rows):
{sampleRows}

Rules:
- Use Title Case (e.g. "Washington State Vehicle Registrations")
- Be specific about the subject, scope, and time period if inferable from the data
- Spell out acronyms unless they are universally understood by the public
- Do NOT include the words "Dataset" or "Data" — the context is implicit
- Do NOT include punctuation at the end
- Do NOT wrap the title in quotes

Return ONLY the title text — nothing else.`;

export const DEFAULT_CATEGORY_PROMPT = `Pick the single best Category for this government dataset on data.wa.gov. You MUST choose exactly one entry from the numbered list below.

Dataset Name: {fileName}
Number of Rows: {rowCount}
Columns (name — type):
{columnInfo}

Sample Data (first {sampleCount} rows):
{sampleRows}

Allowed categories (choose EXACTLY ONE by number):
{categoryList}

Rules:
- Return ONLY the number (e.g., 3) of the single best-fit category from the list above. No text, no punctuation, no explanation.
- If the dataset could plausibly fit multiple categories, choose the one that best reflects the primary subject of the data (what each row is about), not a secondary attribute.
- If no category fits well, still pick the closest one by number — you MUST return a valid index.

Return ONLY the number — nothing else.`;

export const DEFAULT_TAGS_PROMPT = `Generate a concise set of Tags and Keywords for this government dataset on data.wa.gov. Tags help users search and filter datasets.

Dataset Name: {fileName}
Number of Rows: {rowCount}
Columns (name — type):
{columnInfo}

Sample Data (first {sampleCount} rows):
{sampleRows}

Existing tags already used on data.wa.gov (sorted by usage, most popular first):
{tagList}

Selection rules:
- STRONGLY PREFER tags from the list above so this dataset is discoverable alongside related datasets that already use those tags.
- Only invent a NEW tag (one not in the list) if no listed tag accurately captures a key subject of this dataset. When you do, follow the same formatting rules as listed tags.
- Do not pick a listed tag just because it sounds related — it must actually describe this dataset.

Quality rules:
- Return 4–8 tags total.
- Tags must describe the subject matter, scope, and distinguishing features of the data. Prefer specific terms (e.g., "ferry ridership") over generic ones (e.g., "transportation").
- Tags should be lowercase, 1–3 words each, use spaces (not hyphens or underscores), and contain no punctuation.
- Do not duplicate tags. Do not include the dataset title as a tag. Do not include generic filler like "data", "dataset", or "information".

Return ONLY a comma-separated list of tags on a single line — no bullets, no numbering, no explanation, no quotes around individual tags.`;

export const DEFAULT_ROW_LABEL_PROMPT = `Determine the most accurate and concise Row Label for this government dataset on data.wa.gov. The Row Label should describe what a single row represents in plain language.

Dataset Name: {fileName}
Number of Rows: {rowCount}
Columns (name — type):
{columnInfo}

Sample Data (first {sampleCount} rows):
{sampleRows}

Rules:
- The Row Label should be a short noun phrase (1-4 words) that describes what ONE row in the dataset represents.
- Use plain language — no jargon, no acronyms unless universally understood.
- Examples of good row labels: "license record", "traffic incident", "employee", "inspection result", "school enrollment record", "water quality sample"
- Do NOT include the dataset name or agency name in the row label.
- Do NOT use articles ("a", "an", "the").
- Do NOT add punctuation or capitalization beyond the first word.

Return ONLY the row label text — nothing else.`;

export const DEFAULT_PERIOD_OF_TIME_PROMPT = `Determine the Period of Time covered by this government dataset on data.wa.gov. This describes the real-world time span the data represents (not when the dataset was last updated).

Dataset Name: {fileName}
Number of Rows: {rowCount}
Columns (name — type):
{columnInfo}

Sample Data (first {sampleCount} rows):
{sampleRows}

Rules:
- Write a short plain-language sentence (typically 10-25 words).
- If the data contains dated records, describe the span in human terms (e.g. "January 2020 through December 2023", "fiscal years 2018-2024", "as of March 31, 2026").
- If the data is a point-in-time snapshot, say so (e.g. "Current employees as of the publication date.").
- If no time scope can be inferred from the columns or sample values, respond with: "Time period not specified in the data."
- Do NOT guess specific dates that are not supported by the sample data.
- Do NOT include update cadence — that belongs in Posting Frequency.

Return ONLY the Period of Time text — no quotes, no labels, no leading phrases like "Period of Time:".`;

export const DEFAULT_DATASET_SUGGESTION_PROMPT = `You are a metadata quality reviewer for data.wa.gov. Analyze the following dataset description and provide specific, actionable suggestions to improve it.

Evaluate against these criteria:
1. PLAIN LANGUAGE (WA Executive Order 23-02): Are there unexpanded acronyms, jargon, passive voice, filler phrases, or sentences over 20 words?
2. COMPLETENESS: Does it cover content & significance, key fields, scope, and potential users?
3. CLARITY: Is it easy for a non-technical reader to understand what this dataset contains and why it matters?
4. ACCURACY: Are there vague or unsupported claims?

Current description:
"""
{currentDescription}
"""

Return a short bulleted list of specific suggestions. For each suggestion, quote the problematic text and explain how to fix it. If the description is already strong, say so and note any minor tweaks. Do NOT rewrite the description — only provide feedback.`;

export function buildDatasetImprovementPrompt(currentDescription: string, template?: string): string {
    return (template || DEFAULT_DATASET_SUGGESTION_PROMPT)
        .replace(/\{currentDescription}/g, currentDescription);
}

export const DEFAULT_COLUMN_SUGGESTION_PROMPT = `You are a metadata quality reviewer for data.wa.gov. Analyze the following column description for "{columnName}" and provide specific, actionable suggestions to improve it.

Evaluate against these criteria:
1. PLAIN LANGUAGE (WA Executive Order 23-02): Are there unexpanded acronyms, jargon, passive voice, or filler phrases?
2. COMPLETENESS: Does it cover definition, units (if applicable), possible values, empty cells (if applicable), and methods/standards?
3. CLARITY: Is it easy for a non-technical reader to understand what this column contains?
4. ACCURACY: Are there vague or unsupported claims?

Current description:
"""
{currentDescription}
"""

Return a short bulleted list of specific suggestions. For each suggestion, quote the problematic text and explain how to fix it. If the description is already strong, say so and note any minor tweaks. Do NOT rewrite the description — only provide feedback.`;

export function buildColumnImprovementPrompt(columnName: string, currentDescription: string, template?: string): string {
    return (template || DEFAULT_COLUMN_SUGGESTION_PROMPT)
        .replace(/\{columnName}/g, columnName)
        .replace(/\{currentDescription}/g, currentDescription);
}

export function appendPromptModifiers(
    prompt: string,
    modifier: '' | 'concise' | 'detailed' = '',
    customInstruction?: string
): string {
    if (modifier === 'concise') {
        prompt += '\n\nIMPORTANT: Make this description MORE CONCISE. For dataset descriptions, target ~100 words while still covering content, key fields, scope, and users. For column descriptions, target ~50 words while still covering definition, values, and empty cells. Cut filler phrases and combine sentences where possible.';
    } else if (modifier === 'detailed') {
        prompt += '\n\nIMPORTANT: Make this description MORE DETAILED. For dataset descriptions, expand to ~150 words covering all 4 required elements in depth with specific examples from the data. For column descriptions, expand to ~80 words covering all 5 WA guidance elements (definition, units, possible values, empty cells, methods/standards).';
    }
    if (customInstruction) {
        prompt += `\n\nAdditional instruction: ${customInstruction}`;
    }
    return prompt;
}

export interface SuggestionItem {
    id: string;
    text: string;
    selected: boolean;
    edited: boolean;
}

function normalizeTag(raw: string): string {
    return raw
        .trim()
        .toLowerCase()
        .replace(/^["'`]+|["'`]+$/g, '')
        .replace(/[.,;]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function parseTagsFromResponse(text: string): string[] {
    if (!text) return [];
    // Strip any leading bullet/list markers per line, then split on commas/newlines.
    const cleaned = text
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, ''))
        .join(',');
    const seen = new Set<string>();
    const tags: string[] = [];
    for (const piece of cleaned.split(/[,\n]+/)) {
        const tag = normalizeTag(piece);
        if (!tag) continue;
        if (seen.has(tag)) continue;
        seen.add(tag);
        tags.push(tag);
    }
    return tags;
}

export function buildNumberedCategoryList(categories: string[]): string {
    return categories.map((c, i) => `${i + 1}. ${c}`).join('\n');
}

export function parseCategoryIndex(raw: string, allowed: string[]): string {
    if (!raw || allowed.length === 0) return '';

    const match = raw.match(/\b(\d+)\b/);
    if (match) {
        const idx = parseInt(match[1], 10) - 1;
        if (idx >= 0 && idx < allowed.length) return allowed[idx];
    }

    // Fallback: the model ignored the "number-only" instruction — scan for a
    // category name in the free text.
    const lower = raw.toLowerCase();
    const mentioned = allowed.find((c) => lower.includes(c.toLowerCase()));
    return mentioned ?? '';
}

export function buildRegenerateWithSuggestionsPrompt(
    originalPrompt: string,
    suggestions: SuggestionItem[]
): string {
    const applied = suggestions.filter(s => s.selected);
    const appliedTexts = applied.length > 0
        ? applied.map(s => `- ${s.text}`).join('\n')
        : suggestions.map(s => `- ${s.text}`).join('\n');

    return `${originalPrompt}

IMPORTANT: Apply the following improvement suggestions to the description:
${appliedTexts}

Generate an improved version of the description that incorporates all of these changes. Write only the new description — do not explain the changes.`;
}
