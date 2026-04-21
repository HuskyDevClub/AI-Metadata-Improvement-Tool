import Papa from 'papaparse';
import type { ColumnInfo, CsvRow } from '../types';
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
    columns: SocrataColumnMeta[];
    columnStats: Record<string, ColumnInfo>;
}

interface SocrataExportResult {
    success: boolean;
    message: string;
    updatedColumns: number;
}

export async function pushSocrataMetadata(
    datasetId: string,
    datasetTitle: string | undefined,
    datasetDescription: string | undefined,
    rowLabel: string | undefined,
    category: string | undefined,
    tags: string[] | undefined,
    columns: {fieldName: string; description: string}[],
    oauthToken?: string,
    apiKeyId?: string,
    apiKeySecret?: string,
): Promise<SocrataExportResult> {
    const response = await fetch(`${API_BASE_URL}/api/socrata/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            datasetId,
            oauthToken,
            apiKeyId,
            apiKeySecret,
            datasetTitle,
            datasetDescription,
            rowLabel,
            category,
            tags,
            columns
        }),
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
        category: result.category || '',
        tags: Array.isArray(result.tags) ? result.tags : [],
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
): Promise<{id: string; displayName: string; email?: string}> {
    const response = await fetch(`${API_BASE_URL}/api/auth/socrata/userinfo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oauthToken }),
    });
    await assertResponseOk(response, 'Failed to fetch user info');
    return response.json();
}
