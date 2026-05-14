import Papa from 'papaparse';
import type { ColumnInfo, CsvRow, SocrataLicense } from '../types';
import { API_BASE_URL } from './config';
import { assertResponseOk } from './api';

interface ParseResult {
    data: CsvRow[];
    fileName: string;
}

export function parseFile(file: File): Promise<ParseResult> {
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

export async function fetchSocrataImport(datasetId: string): Promise<SocrataImportResult> {
    const response = await fetch(`${API_BASE_URL}/api/socrata/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ datasetId }),
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
    };
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

type SocrataSession =
    | {kind: 'oauth'; user: {id: string; displayName: string; email?: string}}
    | {kind: 'api_key'; apiKeyId: string}
    | {kind: null};

export async function fetchSocrataSession(): Promise<SocrataSession> {
    const response = await fetch(`${API_BASE_URL}/api/auth/socrata/session`, {
        credentials: 'include',
    });
    if (!response.ok) return { kind: null };
    const data = await response.json();
    if (data?.kind === 'oauth' && data.user) {
        return { kind: 'oauth', user: data.user };
    }
    if (data?.kind === 'api_key' && data.apiKeyId) {
        return { kind: 'api_key', apiKeyId: data.apiKeyId };
    }
    return { kind: null };
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

export async function logoutSocrata(): Promise<void> {
    await fetch(`${API_BASE_URL}/api/auth/socrata/logout`, {
        method: 'POST',
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
