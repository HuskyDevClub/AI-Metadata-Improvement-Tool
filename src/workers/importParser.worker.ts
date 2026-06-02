// Dedicated module worker that parses an uploaded data file off the main thread
// and streams it through StreamingDatasetAnalyzer. It posts periodic progress and
// a final compact result ({ data, columnStats, rowCount, fileName }) — the same
// shape a Socrata import produces — so the UI never holds the whole file and
// never freezes, regardless of size.
import Papa from 'papaparse';

import type { CsvRow } from '@/types';
import { StreamingDatasetAnalyzer } from '@/utils/streamingDatasetAnalyzer';

// Minimal worker-scope typing. We avoid pulling in the "webworker" lib (which
// clashes with the project's DOM lib) by casting `self` to just what we use.
interface WorkerScope {
    postMessage(message: unknown): void;
    onmessage: ((e: MessageEvent) => void) | null;
}
const ctx = self as unknown as WorkerScope;

export type ImportWorkerRequest = { file: File };
export type ImportWorkerResponse =
    | { type: 'progress'; rowsProcessed: number }
    | { type: 'done'; data: CsvRow[]; columnStats: Record<string, unknown>; rowCount: number; fileName: string }
    | { type: 'error'; message: string };

const EXCEL_EXTENSIONS = ['.xlsx', '.xls', '.xlsm'];
// Read the CSV in 5 MB slices so memory stays bounded while streaming.
const CSV_CHUNK_BYTES = 5 * 1024 * 1024;
// Throttle progress posts so we don't flood the main thread.
const PROGRESS_INTERVAL = 50_000;

ctx.onmessage = (e: MessageEvent) => {
    const { file } = e.data as ImportWorkerRequest;
    void run(file);
};

async function run(file: File): Promise<void> {
    try {
        const analyzer = new StreamingDatasetAnalyzer();
        const lower = file.name.toLowerCase();
        if (EXCEL_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
            await parseExcel(file, analyzer);
        } else {
            await parseCsv(file, analyzer);
        }
        const result = analyzer.finalize();
        ctx.postMessage({
            type: 'done',
            data: result.data,
            columnStats: result.columnStats,
            rowCount: result.rowCount,
            fileName: file.name,
        } satisfies ImportWorkerResponse);
    } catch (err) {
        ctx.postMessage({
            type: 'error',
            message: err instanceof Error ? err.message : 'Failed to parse file',
        } satisfies ImportWorkerResponse);
    }
}

function postProgress(rows: number): void {
    ctx.postMessage({ type: 'progress', rowsProcessed: rows } satisfies ImportWorkerResponse);
}

function parseCsv(file: File, analyzer: StreamingDatasetAnalyzer): Promise<void> {
    return new Promise((resolve, reject) => {
        let lastReported = 0;
        Papa.parse<CsvRow>(file, {
            header: true,
            skipEmptyLines: true,
            chunkSize: CSV_CHUNK_BYTES,
            chunk: (results) => {
                for (const row of results.data) analyzer.addRow(row);
                if (analyzer.totalRows - lastReported >= PROGRESS_INTERVAL) {
                    lastReported = analyzer.totalRows;
                    postProgress(analyzer.totalRows);
                }
            },
            complete: () => resolve(),
            error: (err: Error) => reject(err),
        });
    });
}

async function parseExcel(file: File, analyzer: StreamingDatasetAnalyzer): Promise<void> {
    // Lazy-load SheetJS so it stays out of the worker's initial chunk.
    const XLSX = await import('xlsx');
    const buffer = new Uint8Array(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'array' });

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('The workbook has no sheets.');

    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        workbook.Sheets[sheetName],
        { defval: '', raw: false },
    );

    let processed = 0;
    for (const raw of rawRows) {
        // Coerce every cell to a string so rows satisfy CsvRow, matching the CSV path.
        const row: CsvRow = {};
        for (const [key, value] of Object.entries(raw)) {
            row[key] = value == null ? '' : String(value);
        }
        analyzer.addRow(row);
        if (++processed % PROGRESS_INTERVAL === 0) postProgress(processed);
    }
}
