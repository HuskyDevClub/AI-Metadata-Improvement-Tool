import Papa from 'papaparse';
import type { CsvRow } from '../types';

// For Databricks deployment, use empty string (relative URL) when not specified
// For local development, default to localhost:3001 (Express) or localhost:8000 (Python)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

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
    data: CsvRow[];
    fileName: string;
    datasetName: string;
    datasetDescription: string;
    columns: SocrataColumnMeta[];
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

export async function parseUrl(url: string, socrataToken?: string): Promise<ParseResult> {
    // Fetch raw CSV from the backend
    const response = await fetch(`${API_BASE_URL}/api/csv/fetch`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({url, socrataToken}),
    });

    if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.detail || `Failed to fetch CSV (${response.status})`);
    }

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
    columns: { fieldName: string; description: string }[],
    appToken?: string,
    apiKeyId?: string,
    apiKeySecret?: string
): Promise<SocrataExportResult> {
    const response = await fetch(`${API_BASE_URL}/api/socrata/export`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({datasetId, appToken, apiKeyId, apiKeySecret, datasetDescription, columns}),
    });

    if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.detail || `Failed to push metadata (${response.status})`);
    }

    return response.json();
}

export async function fetchSocrataImport(
    datasetId: string,
    appToken?: string,
    apiKeyId?: string,
    apiKeySecret?: string
): Promise<SocrataImportResult> {
    const response = await fetch(`${API_BASE_URL}/api/socrata/import`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({datasetId, appToken, apiKeyId, apiKeySecret}),
    });

    if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.detail || `Failed to import dataset (${response.status})`);
    }

    const result = await response.json();

    // Parse CSV with PapaParse (same as parseUrl)
    return new Promise((resolve, reject) => {
        Papa.parse<CsvRow>(result.csvText, {
            header: true,
            skipEmptyLines: true,
            complete: (parseResult) => {
                resolve({
                    data: parseResult.data,
                    fileName: result.fileName,
                    datasetName: result.datasetName,
                    datasetDescription: result.datasetDescription,
                    columns: result.columns,
                });
            },
            error: (error) => {
                reject(new Error(`Error parsing CSV: ${error.message}`));
            },
        });
    });
}
