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
    notes: string[];
    columns: SocrataColumnMeta[];
    columnStats: Record<string, ColumnInfo>;
}

/**
 * Parse a notes string (from Socrata) into an array of individual notes.
 * Splits on double-newlines (paragraphs) or bullet-style lines.
 */
function parseNotesString(raw: string): string[] {
    if (!raw.trim()) return [];
    // Try splitting on double-newline (paragraph breaks) first
    const paragraphs = raw.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    if (paragraphs.length > 1) return paragraphs;
    // Try splitting on single newlines that look like separate items
    const lines = raw.split(/\n/).map(s => s.trim()).filter(Boolean);
    if (lines.length > 1) return lines;
    // Single block of text
    return [raw.trim()];
}

/**
 * Serialize an array of notes into a single string for Socrata export.
 */
function serializeNotes(notes: string[]): string {
    return notes.filter(n => n.trim()).join('\n\n');
}

interface SocrataExportResult {
    success: boolean;
    message: string;
    updatedColumns: number;
}

export async function pushSocrataMetadata(
    datasetId: string,
    datasetDescription: string | undefined,
    rowLabel: string | undefined,
    notes: string[] | undefined,
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
            datasetDescription,
            rowLabel,
            notes: notes ? serializeNotes(notes) : undefined,
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
        notes: parseNotesString(result.notes || ''),
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
