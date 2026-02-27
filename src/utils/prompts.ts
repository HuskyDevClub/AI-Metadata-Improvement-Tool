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
