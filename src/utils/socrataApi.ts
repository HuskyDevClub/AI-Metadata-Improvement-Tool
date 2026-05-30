import Papa from 'papaparse';
import type { ColumnInfo, CsvRow, SocrataLicense } from '@/types';
import { API_BASE_URL } from '@/utils/config';
import { assertResponseOk } from '@/utils/api';

interface ParseResult {
    data: CsvRow[];
    fileName: string;
}

/** Delimited text formats PapaParse reads (it auto-detects the delimiter). */
const CSV_EXTENSIONS = ['.csv', '.tsv'];
/** Spreadsheet formats read client-side with SheetJS. */
const EXCEL_EXTENSIONS = ['.xlsx', '.xls', '.xlsm'];

/** Every extension the uploader accepts, e.g. for an `<input accept>`. */
export const ACCEPTED_UPLOAD_EXTENSIONS = [...CSV_EXTENSIONS, ...EXCEL_EXTENSIONS];

function hasExtension(file: File, extensions: string[]): boolean {
    const name = file.name.toLowerCase();
    return extensions.some((ext) => name.endsWith(ext));
}

/** True when the file is a format the uploader knows how to parse. */
export function isSupportedDataFile(file: File): boolean {
    return hasExtension(file, ACCEPTED_UPLOAD_EXTENSIONS);
}

/**
 * Parse an uploaded data file into rows keyed by column header. Excel workbooks
 * (.xlsx/.xls/.xlsm) are read with SheetJS; everything else takes the CSV/TSV
 * path. Both resolve to the same { data, fileName } shape so callers stay
 * format-agnostic.
 */
export function parseFile(file: File): Promise<ParseResult> {
    return hasExtension(file, EXCEL_EXTENSIONS)
        ? parseExcelFile(file)
        : parseCsvFile(file);
}

function parseCsvFile(file: File): Promise<ParseResult> {
    return new Promise((resolve, reject) => {
        Papa.parse<CsvRow>(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                resolve({
                    data: results.data,
                    fileName: file.name,
                });
            },
            error: (error) => {
                reject(new Error(`Error parsing CSV: ${error.message}`));
            },
        });
    });
}

/**
 * Parse the first worksheet of an Excel workbook. Cells come back as the
 * formatted strings the user sees in Excel (dates, numbers) so the result
 * matches the CSV path's all-string values.
 */
async function parseExcelFile(file: File): Promise<ParseResult> {
    // Lazy-load SheetJS: it's large and only needed for spreadsheet uploads,
    // so keep it out of the initial bundle.
    const XLSX = await import('xlsx');

    const buffer = new Uint8Array(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'array' });

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('The workbook has no sheets.');

    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        workbook.Sheets[sheetName],
        { defval: '', raw: false },
    );

    // Coerce every cell to a string so rows satisfy CsvRow and the downstream
    // pipeline, which assumes string values everywhere.
    const data: CsvRow[] = rawRows.map((row) => {
        const out: CsvRow = {};
        for (const [key, value] of Object.entries(row)) {
            out[key] = value == null ? '' : String(value);
        }
        return out;
    });

    return { data, fileName: file.name };
}

interface SocrataColumnMeta {
    fieldName: string;
    name: string;
    description: string;
    dataTypeName: string;
}

interface SocrataImportResult {
    sampleRows: CsvRow[];
    totalRowCount: number;
    fileName: string;
    datasetName: string;
    datasetDescription: string;
    rowLabel: string;
    category: string;
    tags: string[];
    licenseId: string;
    attribution: string;
    contactEmail: string;
    periodOfTime: string;
    postingFrequency: string;
    columns: SocrataColumnMeta[];
    columnStats: Record<string, ColumnInfo>;
    /** True when the signed-in user may edit (push metadata back to) this dataset. */
    canEdit: boolean;
}

interface SocrataExportResult {
    success: boolean;
    message: string;
    updatedColumns: number;
}

export interface PushSocrataMetadataOptions {
    datasetId: string;
    datasetTitle?: string;
    datasetDescription?: string;
    rowLabel?: string;
    category?: string;
    tags?: string[];
    licenseId?: string;
    attribution?: string;
    contactEmail?: string;
    periodOfTime?: string;
    postingFrequency?: string;
    columns: {
        fieldName: string;
        description?: string;
        name?: string;
        newFieldName?: string;
    }[];
}

export async function pushSocrataMetadata(
    options: PushSocrataMetadataOptions,
): Promise<SocrataExportResult> {
    const response = await fetch(`${API_BASE_URL}/api/socrata/export`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify(options),
    });

    await assertResponseOk(response, 'Failed to push metadata');

    return response.json();
}

export async function fetchSocrataImport(
    datasetId: string,
    inlineKey?: {apiKeyId: string; apiKeySecret: string},
    domain?: string,
): Promise<SocrataImportResult> {
    // `domain` is a per-request portal override from a pasted URL — read from
    // that portal for this import only; the configured portal is left untouched.
    const body: Record<string, string> = { datasetId };
    if (inlineKey) {
        body.apiKeyId = inlineKey.apiKeyId;
        body.apiKeySecret = inlineKey.apiKeySecret;
    }
    if (domain) body.domain = domain;
    const response = await fetch(`${API_BASE_URL}/api/socrata/import`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify(body),
    });

    await assertResponseOk(response, 'Failed to import dataset');

    const result = await response.json();

    return {
        sampleRows: result.sampleRows,
        totalRowCount: result.totalRowCount,
        fileName: result.fileName,
        datasetName: result.datasetName,
        datasetDescription: result.datasetDescription,
        rowLabel: result.rowLabel || '',
        category: result.category || '',
        tags: Array.isArray(result.tags) ? result.tags : [],
        licenseId: result.licenseId || '',
        attribution: result.attribution || '',
        contactEmail: result.contactEmail || '',
        periodOfTime: result.periodOfTime || '',
        postingFrequency: result.postingFrequency || '',
        columns: result.columns,
        columnStats: result.columnStats,
        canEdit: Boolean(result.canEdit),
    };
}

/**
 * Re-check whether the current identity may edit (push metadata back to) a
 * dataset. The `canEdit` from import reflects whatever credentials were active
 * then; call this after a sign-in/out or API-key change so the Push button
 * tracks the current identity. Fails closed (returns false) on any error.
 */
export async function fetchSocrataRights(datasetId: string): Promise<boolean> {
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/socrata/rights/${encodeURIComponent(datasetId)}`,
            { credentials: 'include' },
        );
        if (!response.ok) return false;
        const result = await response.json();
        return Boolean(result.canEdit);
    } catch {
        return false;
    }
}

export interface SocrataConfig {
    /** Portal currently in effect (per-user override or server default). */
    domain: string;
    /** Server default — lets the UI offer a "reset to default" action. */
    defaultDomain: string;
    /** Whether the "Sign in" UI is exposed (gated by ENABLE_SOCRATA_OAUTH). */
    enableOAuth: boolean;
    /**
     * Whether the Settings "Save keys" / "Save configuration" (and "Clear")
     * buttons are exposed (gated by ENABLE_CONFIG_SAVE). Defaults to false.
     */
    enableConfigSave: boolean;
}

function parseSocrataConfig(result: unknown): SocrataConfig {
    const data = (result ?? {}) as Record<string, unknown>;
    const domain = String(data.domain || '');
    return {
        domain,
        defaultDomain: String(data.defaultDomain || domain || ''),
        enableOAuth: data.enableOAuth === true,
        enableConfigSave: data.enableConfigSave === true,
    };
}

export async function fetchSocrataConfig(): Promise<SocrataConfig> {
    const response = await fetch(`${API_BASE_URL}/api/socrata/config`);
    await assertResponseOk(response, 'Failed to load Socrata config');
    return parseSocrataConfig(await response.json());
}

/**
 * Set or clear the per-user Socrata portal override. Pass an empty string to
 * clear the override and revert to the server default. Returns the resulting
 * effective config.
 */
export async function saveSocrataDomain(domain: string): Promise<SocrataConfig> {
    const response = await fetch(`${API_BASE_URL}/api/socrata/config`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify({ domain }),
    });
    await assertResponseOk(response, 'Failed to save portal domain');
    return parseSocrataConfig(await response.json());
}

export async function fetchSocrataCategories(): Promise<string[]> {
    const response = await fetch(`${API_BASE_URL}/api/socrata/categories`);
    await assertResponseOk(response, 'Failed to load categories');
    const result = await response.json();
    return Array.isArray(result.categories) ? result.categories : [];
}

export async function fetchSocrataTags(category?: string): Promise<string[]> {
    const qs = category ? `?category=${encodeURIComponent(category)}` : '';
    const response = await fetch(`${API_BASE_URL}/api/socrata/tags${qs}`);
    await assertResponseOk(response, 'Failed to load tags');
    const result = await response.json();
    return Array.isArray(result.tags) ? result.tags : [];
}

export async function fetchSocrataLicenses(): Promise<SocrataLicense[]> {
    const response = await fetch(`${API_BASE_URL}/api/socrata/licenses`);
    await assertResponseOk(response, 'Failed to load licenses');
    const result = await response.json();
    return Array.isArray(result.licenses) ? result.licenses : [];
}

export async function fetchSocrataOAuthLoginUrl(): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/api/auth/socrata/login`);
    await assertResponseOk(response, 'Failed to get OAuth URL');
    const result = await response.json();
    return result.authUrl;
}

/**
 * Current Socrata auth. The OAuth sign-in and the saved API key are
 * independent identities — either, both, or neither may be present.
 */
export interface SocrataSession {
    /** OAuth identity, or null when not signed in. */
    oauthUser: {id: string; displayName: string; email?: string} | null;
    /** Saved API key id (never the secret); '' when no key is saved. */
    apiKeyId: string;
}

export async function fetchSocrataSession(): Promise<SocrataSession> {
    const response = await fetch(`${API_BASE_URL}/api/auth/socrata/session`, {
        credentials: 'include',
    });
    if (!response.ok) return { oauthUser: null, apiKeyId: '' };
    const data = await response.json();
    return {
        oauthUser: data?.user ?? null,
        apiKeyId: typeof data?.apiKeyId === 'string' ? data.apiKeyId : '',
    };
}

export async function saveSocrataApiKey(apiKeyId: string, apiKeySecret: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/auth/socrata/api-key`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body: JSON.stringify({ apiKeyId, apiKeySecret }),
    });
    await assertResponseOk(response, 'Failed to save API key');
}

/** Sign out of the OAuth session. Leaves any saved API key intact. */
export async function logoutSocrata(): Promise<void> {
    await fetch(`${API_BASE_URL}/api/auth/socrata/logout`, {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
    });
}

/** Remove the saved API key. Leaves any OAuth session intact. */
export async function clearSocrataApiKey(): Promise<void> {
    await fetch(`${API_BASE_URL}/api/auth/socrata/api-key`, {
        method: 'DELETE',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
    });
}

// Plain-language labels for the Socrata `dataTypeName` strings we expose to
// the LLM. Covers both canonical SoQL types (dev.socrata.com/docs/datatypes)
// and legacy NBE/OBE render types that still surface on older datasets but
// don't appear on the canonical page — without these, the model has no
// anchor for names like "calendar_date", "dataset_link", or "nested_table".
const SOCRATA_TYPE_LABELS: Record<string, string> = {
    number: 'number',
    money: 'number (money / currency)',
    percent: 'number (percent, 0-100)',
    double: 'number (double-precision)',
    text: 'text',
    url: 'URL (hyperlink with optional description)',
    email: 'email address (text)',
    phone: 'phone number (text)',
    checkbox: 'checkbox (true/false)',
    flag: 'flag (small fixed set of values)',
    calendar_date: 'date/time (no time zone)',
    date: 'date',
    floating_timestamp: 'timestamp (no time zone)',
    fixed_timestamp: 'timestamp (UTC)',
    point: 'geographic point',
    line: 'geographic line',
    polygon: 'geographic polygon',
    multipoint: 'geographic multi-point',
    multiline: 'geographic multi-line',
    multipolygon: 'geographic multi-polygon',
    location: 'geographic location (lat/long + address)',
    document: 'document attachment (binary)',
    photo: 'photo attachment (binary)',
    dataset_link: 'link to another dataset',
    nested_table: 'nested table (rows within a row)',
};

export function describeSocrataType(dataTypeName: string | undefined | null): string {
    if (!dataTypeName) return 'unknown';
    const key = dataTypeName.toLowerCase();
    const label = SOCRATA_TYPE_LABELS[key];
    return label ? `${label} (${key})` : key;
}
