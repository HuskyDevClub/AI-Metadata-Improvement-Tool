import type {
    ColumnComparisonResult,
    ColumnInfo,
    ColumnType,
    ComparisonConfig,
    ComparisonSubMode,
    ComparisonTokenUsage,
    DatasetComparisonResult,
    GeneratedResults,
    JudgeResult,
    TokenUsage,
} from '../types';

// --- Export format shapes (what the JSON file looks like) ---

interface ExportMetadataBase {
    fileName: string;
    rowCount: number;
    columnCount: number;
    exportDate: string;
}

interface StandardExportColumn {
    name: string;
    type: string;
    statistics: Record<string, unknown>;
    description: string;
}

interface StandardExport {
    metadata: ExportMetadataBase;
    datasetDescription: string;
    columns: StandardExportColumn[];
}

interface ComparisonExportOutput {
    slotIndex: number;
    slotName: string;
    output: string;
}

interface ComparisonExportColumn {
    name: string;
    type: string;
    statistics: Record<string, unknown>;
    outputs: ComparisonExportOutput[];
    judgeResult: JudgeResult | null;
}

interface ComparisonExportMetadata extends ExportMetadataBase {
    mode: 'comparison';
    subMode: ComparisonSubMode;
    judgeModel: string;
    // Model comparison
    models?: { index: number; name: string; label: string }[];
    // Prompt comparison
    model?: string;
    promptVariants?: {
        index: number;
        label: string;
        systemPrompt: string;
        datasetPrompt: string;
        columnPrompt: string;
    }[];
}

interface ComparisonExport {
    metadata: ComparisonExportMetadata;
    datasetDescription: {
        outputs: ComparisonExportOutput[];
        judgeResult: JudgeResult | null;
    };
    columns: ComparisonExportColumn[];
    tokenUsage?: ComparisonTokenUsage;
}

// --- Result types ---

export interface StandardImportResult {
    mode: 'standard';
    fileName: string;
    rowCount: number;
    columnStats: Record<string, ColumnInfo>;
    generatedResults: GeneratedResults;
}

export interface ComparisonImportResult {
    mode: 'comparison';
    fileName: string;
    rowCount: number;
    columnStats: Record<string, ColumnInfo>;
    comparisonConfig: Partial<ComparisonConfig>;
    datasetComparison: DatasetComparisonResult;
    columnComparisons: Record<string, ColumnComparisonResult>;
    comparisonTokenUsage: ComparisonTokenUsage;
}

export type ImportResult =
    | { ok: true; data: StandardImportResult }
    | { ok: true; data: ComparisonImportResult }
    | { ok: false; error: string };

// --- Helpers ---

const VALID_COLUMN_TYPES: ColumnType[] = ['numeric', 'categorical', 'text', 'empty'];

function isValidColumnType(t: unknown): t is ColumnType {
    return typeof t === 'string' && VALID_COLUMN_TYPES.includes(t as ColumnType);
}

function reconstructColumnInfo(
    type: string,
    statistics: Record<string, unknown>,
    rowCount: number,
): ColumnInfo {
    const colType: ColumnType = isValidColumnType(type) ? type : 'text';
    const statsCount = typeof statistics?.count === 'number' ? statistics.count : rowCount;
    const nullCount = rowCount - statsCount;

    return {
        type: colType,
        stats: statistics as ColumnInfo['stats'],
        nullCount: nullCount >= 0 ? nullCount : 0,
        totalCount: rowCount,
    };
}

function isComparisonExport(data: unknown): data is ComparisonExport {
    const d = data as Record<string, unknown>;
    const meta = d?.metadata as Record<string, unknown> | undefined;
    return meta?.mode === 'comparison';
}

const EMPTY_TOKEN_USAGE: TokenUsage = {promptTokens: 0, completionTokens: 0, totalTokens: 0};

// --- Main validator ---

export function validateAndParseImport(json: unknown): ImportResult {
    if (!json || typeof json !== 'object') {
        return {ok: false, error: 'Invalid JSON: expected an object.'};
    }

    const data = json as Record<string, unknown>;

    // Validate metadata
    const metadata = data.metadata as Record<string, unknown> | undefined;
    if (!metadata || typeof metadata !== 'object') {
        return {ok: false, error: 'Missing or invalid "metadata" field.'};
    }
    if (typeof metadata.fileName !== 'string') {
        return {ok: false, error: 'Missing "metadata.fileName".'};
    }
    if (typeof metadata.rowCount !== 'number' || metadata.rowCount < 0) {
        return {ok: false, error: 'Missing or invalid "metadata.rowCount".'};
    }

    // Determine mode
    if (isComparisonExport(json)) {
        return parseComparisonImport(json);
    }
    return parseStandardImport(json as StandardExport);
}

function parseStandardImport(data: unknown): ImportResult {
    const d = data as StandardExport;

    if (typeof d.datasetDescription !== 'string') {
        return {ok: false, error: 'Missing "datasetDescription" string for standard export.'};
    }

    if (!Array.isArray(d.columns) || d.columns.length === 0) {
        return {ok: false, error: 'Missing or empty "columns" array.'};
    }

    const columnStats: Record<string, ColumnInfo> = {};
    const columnDescriptions: Record<string, string> = {};

    for (const col of d.columns) {
        if (!col.name || typeof col.name !== 'string') {
            return {ok: false, error: 'Column entry missing "name".'};
        }
        columnStats[col.name] = reconstructColumnInfo(
            col.type,
            col.statistics || {},
            d.metadata.rowCount,
        );
        columnDescriptions[col.name] = col.description || '';
    }

    return {
        ok: true,
        data: {
            mode: 'standard',
            fileName: d.metadata.fileName,
            rowCount: d.metadata.rowCount,
            columnStats,
            generatedResults: {
                datasetDescription: d.datasetDescription,
                columnDescriptions,
            },
        },
    };
}

function parseComparisonImport(data: ComparisonExport): ImportResult {
    const meta = data.metadata;

    if (!data.datasetDescription || typeof data.datasetDescription !== 'object') {
        return {ok: false, error: 'Missing "datasetDescription" object for comparison export.'};
    }

    if (!Array.isArray(data.datasetDescription.outputs)) {
        return {ok: false, error: 'Missing "datasetDescription.outputs" array.'};
    }

    if (!Array.isArray(data.columns) || data.columns.length === 0) {
        return {ok: false, error: 'Missing or empty "columns" array.'};
    }

    const slotCount = data.datasetDescription.outputs.length;

    // Reconstruct partial ComparisonConfig
    const comparisonConfig: Partial<ComparisonConfig> = {
        subMode: meta.subMode,
        judgeModel: meta.judgeModel || '',
    };

    if (meta.subMode === 'prompts') {
        comparisonConfig.promptModel = meta.model || '';
        comparisonConfig.promptVariants = (meta.promptVariants || []).map(v => ({
            label: v.label,
            systemPrompt: v.systemPrompt,
            datasetPrompt: v.datasetPrompt,
            columnPrompt: v.columnPrompt,
        }));
        // Ensure models array has correct length for slot tracking
        comparisonConfig.models = [];
    } else {
        comparisonConfig.models = (meta.models || []).map(m => m.name);
        comparisonConfig.promptVariants = [];
        comparisonConfig.promptModel = '';
    }

    // Dataset comparison
    const datasetComparison: DatasetComparisonResult = {
        outputs: data.datasetDescription.outputs.map(o => o.output),
        judgeResult: data.datasetDescription.judgeResult || null,
        isJudging: false,
    };

    // Column stats & comparisons
    const columnStats: Record<string, ColumnInfo> = {};
    const columnComparisons: Record<string, ColumnComparisonResult> = {};

    for (const col of data.columns) {
        if (!col.name || typeof col.name !== 'string') {
            return {ok: false, error: 'Column entry missing "name".'};
        }
        columnStats[col.name] = reconstructColumnInfo(
            col.type,
            col.statistics || {},
            meta.rowCount,
        );
        columnComparisons[col.name] = {
            outputs: Array.isArray(col.outputs)
                ? col.outputs.map(o => o.output)
                : Array(slotCount).fill(''),
            judgeResult: col.judgeResult || null,
            isJudging: false,
        };
    }

    // Token usage (may not be present in older exports)
    const comparisonTokenUsage: ComparisonTokenUsage = data.tokenUsage || {
        models: Array(slotCount).fill(null).map(() => ({...EMPTY_TOKEN_USAGE})),
        judge: {...EMPTY_TOKEN_USAGE},
        total: {...EMPTY_TOKEN_USAGE},
    };

    return {
        ok: true,
        data: {
            mode: 'comparison',
            fileName: meta.fileName,
            rowCount: meta.rowCount,
            columnStats,
            comparisonConfig,
            datasetComparison,
            columnComparisons,
            comparisonTokenUsage,
        },
    };
}
