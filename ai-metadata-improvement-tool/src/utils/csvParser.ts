import Papa from 'papaparse';
import type { CsvRow } from '../types';

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

export function parseUrl(url: string, appToken?: string): Promise<ParseResult> {
    return new Promise((resolve, reject) => {
        const downloadRequestHeaders: Record<string, string> = {};
        if (appToken) {
            downloadRequestHeaders['X-App-Token'] = appToken;
        }

        Papa.parse<CsvRow>(url, {
            download: true,
            header: true,
            skipEmptyLines: true,
            downloadRequestHeaders,
            complete: (results) => {
                const fileName = url.split('/').pop() || 'remote-data.csv';
                resolve({
                    data: results.data,
                    fileName,
                });
            },
            error: (error) => {
                reject(new Error(`Error fetching CSV: ${error.message}`));
            },
        });
    });
}
