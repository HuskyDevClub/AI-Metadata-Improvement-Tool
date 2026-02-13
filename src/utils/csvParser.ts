import Papa from 'papaparse';
import type { CsvRow } from '../types';

// For Databricks deployment, use empty string (relative URL) when not specified
// For local development, default to localhost:3001 (Express) or localhost:8000 (Python)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

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

export async function parseUrl(url: string, socrataToken?: string): Promise<ParseResult> {
    // Fetch raw CSV from the backend
    const body: Record<string, string> = {url};
    if (socrataToken) {
        body.socrataToken = socrataToken;
    }

    const response = await fetch(`${API_BASE_URL}/api/csv/fetch`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch CSV');
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
