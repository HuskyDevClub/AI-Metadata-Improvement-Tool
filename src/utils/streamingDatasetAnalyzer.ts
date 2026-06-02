import type { ColumnInfo, CsvRow } from '@/types';
import { analyzeColumn } from '@/utils/columnAnalyzer';
import { ColumnSketch } from '@/utils/streamingStats';

// Rows up to this count are kept in full and analysed exactly with
// `analyzeColumn` — identical to the pre-streaming behaviour. Past it, only
// sample rows + bounded-memory sketch stats are retained, so memory stays
// bounded no matter how large the file is.
export const EXACT_ANALYSIS_ROW_LIMIT = 100_000;

// How many rows to keep for previews/prompts once a file exceeds the exact
// limit. Mirrors the handful of sample rows a Socrata import returns.
const SAMPLE_ROW_COUNT = 50;

export interface StreamingAnalysisResult {
    /** Full rows when <= EXACT_ANALYSIS_ROW_LIMIT, otherwise sample rows. */
    data: CsvRow[];
    columnStats: Record<string, ColumnInfo>;
    /** True total row count, regardless of how many rows are retained. */
    rowCount: number;
}

/**
 * Accumulates a dataset row-by-row in a single pass with bounded memory.
 *
 * Small/medium files (<= EXACT_ANALYSIS_ROW_LIMIT) are buffered in full and
 * handed to the existing `analyzeColumn` at finalize, so their stats are exact
 * and unchanged. The first row past the limit triggers a one-time switch to
 * per-column sketches: the buffered rows are replayed into the sketches, the
 * buffer is freed (only sample rows are kept), and all further rows feed the
 * sketches directly. Output matches the shape a Socrata import produces.
 */
export class StreamingDatasetAnalyzer {
    private rowCount = 0;
    private columns: string[] | null = null;
    private mode: 'buffer' | 'sketch' = 'buffer';
    private buffer: CsvRow[] = [];
    private readonly sampleRows: CsvRow[] = [];
    private sketches: Map<string, ColumnSketch> | null = null;

    addRow(row: CsvRow): void {
        this.rowCount++;
        // Column set is fixed from the header row (matches analyzeColumn, which
        // derives columns from the first row).
        if (this.columns === null) this.columns = Object.keys(row);
        if (this.sampleRows.length < SAMPLE_ROW_COUNT) this.sampleRows.push(row);

        if (this.mode === 'buffer') {
            this.buffer.push(row);
            if (this.buffer.length > EXACT_ANALYSIS_ROW_LIMIT) this.switchToSketch();
        } else {
            this.feedSketch(row);
        }
    }

    get totalRows(): number {
        return this.rowCount;
    }

    private switchToSketch(): void {
        this.mode = 'sketch';
        this.sketches = new Map();
        for (const col of this.columns ?? []) this.sketches.set(col, new ColumnSketch());
        // Replay buffered rows through the sketches, then release the buffer.
        for (const row of this.buffer) this.feedSketch(row);
        this.buffer = [];
    }

    private feedSketch(row: CsvRow): void {
        const sketches = this.sketches!;
        for (const col of this.columns ?? []) sketches.get(col)!.add(row[col]);
    }

    finalize(): StreamingAnalysisResult {
        const columns = this.columns ?? [];
        const columnStats: Record<string, ColumnInfo> = {};

        if (this.mode === 'buffer') {
            // Exact path: full rows retained, analysed with the in-memory analyzer.
            for (const col of columns) {
                columnStats[col] = analyzeColumn(col, this.buffer.map((row) => row[col]));
            }
            return { data: this.buffer, columnStats, rowCount: this.rowCount };
        }

        const sketches = this.sketches!;
        for (const col of columns) {
            columnStats[col] = sketches.get(col)!.finalize(this.rowCount);
        }
        return { data: this.sampleRows, columnStats, rowCount: this.rowCount };
    }
}
