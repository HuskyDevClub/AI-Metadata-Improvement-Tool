import Papa from 'papaparse';
import type { ColumnInfo, CsvRow } from '../types';
import { API_BASE_URL } from './config';
import { assertResponseOk } from './api';

export interface ParseResult {
    data: CsvRow[];
    fileName: string;
}

export interface SocrataColumnMeta {
    fieldName: string;
    name: string;
    description: string;
    dataTypeName: string;
}

export interface SocrataImportResult {
    sampleRows: CsvRow[];
    totalRowCount: number;
    fileName: string;
    datasetName: string;
    datasetDescription: string;
    rowLabel: string;
    columns: SocrataColumnMeta[];
    columnStats: Record<string, ColumnInfo>;
}

/**
 * Extract a Socrata dataset ID from a URL if it matches known Socrata URL patterns.
 * Dataset IDs follow the format: xxxx-xxxx (4 alphanumeric chars, hyphen, 4 alphanumeric chars).
 * Returns the dataset ID if found, or null if the URL is not a recognized Socrata URL.
 */
export function extractSocrataDatasetId(url: string): string | null {
    try {
        const path = new URL(url).pathname;

        // /api/views/{id}/... or /api/v3/views/{id}/...
        const viewsMatch = path.match(/\/api\/(?:v\d+\/)?views\/([a-z0-9]{4}-[a-z0-9]{4})/);
        if (viewsMatch) return viewsMatch[1];

        // /resource/{id}.{ext} (SODA API)
        const resourceMatch = path.match(/\/resource\/([a-z0-9]{4}-[a-z0-9]{4})\./);
        if (resourceMatch) return resourceMatch[1];

        // /d/{id} (short URL)
        const shortMatch = path.match(/\/d\/([a-z0-9]{4}-[a-z0-9]{4})/);
        if (shortMatch) return shortMatch[1];

        // /{category}/{name}/{id} — dataset ID as last path segment
        const segments = path.split('/').filter(Boolean);
        if (segments.length >= 1) {
            const last = segments[segments.length - 1];
            if (/^[a-z0-9]{4}-[a-z0-9]{4}$/.test(last)) return last;
        }
    } catch {
        // Not a valid URL
    }

    return null;
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

export async function parseUrl(url: string): Promise<ParseResult> {
    // Fetch raw CSV from the backend
    const response = await fetch(`${API_BASE_URL}/api/csv/fetch`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
    });

    await assertResponseOk(response, 'Failed to fetch CSV');

    const result = await response.json();

    // Parse CSV on the frontend
    return new Promise((resolve, reject) => {
        Papa.parse<CsvRow>(result.csvText, {
            header: true,
            skipEmptyLines: true,
            complete: (parseResult) => {
                resolve({
                    data: parseResult.data,
                    fileName: result.fileName,
                });
            },
            error: (error) => {
                reject(new Error(`Error parsing CSV: ${error.message}`));
            },
        });
    });
}

export interface SocrataExportResult {
    success: boolean;
    message: string;
    updatedColumns: number;
}

export async function pushSocrataMetadata(
    datasetId: string,
    datasetDescription: string | undefined,
    rowLabel: string | undefined,
    columns: { fieldName: string; description: string }[],
    oauthToken?: string,
    apiKeyId?: string,
    apiKeySecret?: string,
): Promise<SocrataExportResult> {
    const response = await fetch(`${API_BASE_URL}/api/socrata/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId, oauthToken, apiKeyId, apiKeySecret, datasetDescription, rowLabel, columns }),
    });

    await assertResponseOk(response, 'Failed to push metadata');

    return response.json();
}

export async function fetchSocrataImport(
    datasetId: string,
    oauthToken?: string,
    apiKeyId?: string,
    apiKeySecret?: string,
): Promise<SocrataImportResult> {
    const response = await fetch(`${API_BASE_URL}/api/socrata/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId, oauthToken, apiKeyId, apiKeySecret }),
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
        columns: result.columns,
        columnStats: result.columnStats,
    };
}

export async function fetchSocrataOAuthLoginUrl(): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/api/auth/socrata/login`);
    await assertResponseOk(response, 'Failed to get OAuth URL');
    const result = await response.json();
    return result.authUrl;
}

export async function fetchSocrataOAuthUserInfo(
    oauthToken: string,
): Promise<{ id: string; displayName: string; email?: string }> {
    const response = await fetch(`${API_BASE_URL}/api/auth/socrata/userinfo`, {
        method: 'POST',
        headers: { 'Authorization': `OAuth ${oauthToken}` },
    });
    await assertResponseOk(response, 'Failed to fetch user info');
    return response.json();
}
