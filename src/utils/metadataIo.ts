import type { GeneratedResults } from '@/types';
import {
    type ColumnFieldKind,
    columnKey,
    type DatasetFieldKey,
    datasetKey,
    valuesEqual,
} from '@/utils/fieldRevisions';

// Bump when the on-disk shape changes in a way older importers can't read.
export const METADATA_EXPORT_VERSION = 1;

// The dataset scalar (string) fields, in the order they're applied. `tags` is an
// array and is handled separately.
type StringDatasetField = Exclude<DatasetFieldKey, 'tags'>;
const SCALAR_FIELDS: StringDatasetField[] = [
    'datasetTitle',
    'datasetDescription',
    'rowLabel',
    'category',
    'licenseId',
    'attribution',
    'contactEmail',
    'periodOfTime',
    'postingFrequency',
];

const COLUMN_MAPS: [keyof Pick<GeneratedResults,
    'columnDescriptions' | 'columnDisplayNames' | 'columnFieldNames'>, ColumnFieldKind][] = [
    ['columnDescriptions', 'description'],
    ['columnDisplayNames', 'displayName'],
    ['columnFieldNames', 'fieldName'],
];

/** The full file written to disk on export. */
export interface MetadataExport {
    formatVersion: number;
    exportedAt: string;
    fileName: string;
    socrataDatasetId?: string;
    socrataDomain?: string;
    metadata: GeneratedResults;
}

interface BuildExportOptions {
    metadata: GeneratedResults;
    fileName: string;
    socrataDatasetId?: string;
    socrataDomain?: string | null;
}

export function buildMetadataExport({
                                        metadata,
                                        fileName,
                                        socrataDatasetId,
                                        socrataDomain,
                                    }: BuildExportOptions): MetadataExport {
    return {
        formatVersion: METADATA_EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        fileName,
        ...(socrataDatasetId ? { socrataDatasetId } : {}),
        ...(socrataDomain ? { socrataDomain } : {}),
        metadata,
    };
}

/** Turn a title/filename into a safe, lowercase file-name stem. */
function slugify(input: string): string {
    const slug = input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || 'metadata';
}

/** Derive the suggested download name from the dataset title or source file. */
export function metadataExportFileName(metadata: GeneratedResults, fileName: string): string {
    const base = metadata.datasetTitle.trim()
        || fileName.replace(/\.[^.]+$/, '')
        || 'metadata';
    return `${slugify(base)}.metadata.json`;
}

/** Build the export object, serialize it, and trigger a browser download. */
export function downloadMetadataExport(options: BuildExportOptions): void {
    const payload = buildMetadataExport(options);
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = metadataExportFileName(options.metadata, options.fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Defer revocation so the download has a chance to start in all browsers.
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

// --- Import ---

function asString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const strings = value.filter((v): v is string => typeof v === 'string');
    return strings;
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (typeof v === 'string') out[k] = v;
    }
    return out;
}

/** Pull a sanitized, partial GeneratedResults out of arbitrary parsed JSON. */
function coerceMetadata(raw: unknown): Partial<GeneratedResults> {
    if (!raw || typeof raw !== 'object') return {};
    const src = raw as Record<string, unknown>;
    const out: Partial<GeneratedResults> = {};

    for (const f of SCALAR_FIELDS) {
        const v = asString(src[f]);
        if (v !== undefined) out[f] = v;
    }
    const tags = asStringArray(src.tags);
    if (tags) out.tags = tags;

    for (const [mapKey] of COLUMN_MAPS) {
        const rec = asStringRecord(src[mapKey]);
        if (rec) out[mapKey] = rec;
    }
    return out;
}

export interface ParsedMetadataImport {
    metadata: Partial<GeneratedResults>;
    fileName?: string;
    socrataDatasetId?: string;
}

/**
 * Parse the text of an uploaded metadata file. Accepts our own export envelope
 * ({ formatVersion, metadata, ... }) and, leniently, a bare GeneratedResults
 * object so hand-written or legacy files still import. Throws on invalid JSON or
 * a payload with no recognizable metadata fields.
 */
export function parseMetadataImport(text: string): ParsedMetadataImport {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error('The file is not valid JSON.');
    }
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('The file does not contain a metadata object.');
    }

    const root = parsed as Record<string, unknown>;
    // Envelope form when a `metadata` object is present; otherwise treat the
    // whole object as the metadata itself.
    const hasEnvelope = root.metadata && typeof root.metadata === 'object';
    const metadataSource = hasEnvelope ? root.metadata : root;
    const metadata = coerceMetadata(metadataSource);

    if (Object.keys(metadata).length === 0) {
        throw new Error('No recognizable metadata fields were found in the file.');
    }

    return {
        metadata,
        fileName: hasEnvelope ? asString(root.fileName) : undefined,
        socrataDatasetId: hasEnvelope ? asString(root.socrataDatasetId) : undefined,
    };
}

export interface MetadataApplyResult {
    next: GeneratedResults;
    // Field-history entries to record (key + new value); ordered dataset-first.
    revisions: {key: string; value: string | string[]}[];
    // Column names present in the file but absent from the current dataset.
    skippedColumns: string[];
    // Column names from the file that matched and were applied.
    matchedColumns: string[];
}

/**
 * Merge imported metadata onto the currently-loaded results. Only fields present
 * in `incoming` are touched (a true round-trip restores everything, but partial
 * files leave the rest alone). Column entries are applied only for columns that
 * exist in the loaded dataset — matched by name — so a file from a different
 * dataset can't inject phantom columns. Returns the merged results plus the
 * revisions to record so each change shows up in field history and is reversible.
 */
export function applyMetadataImport(
    prev: GeneratedResults,
    incoming: Partial<GeneratedResults>,
    allowedColumns: Set<string>,
): MetadataApplyResult {
    const next: GeneratedResults = { ...prev };
    const revisions: {key: string; value: string | string[]}[] = [];

    for (const f of SCALAR_FIELDS) {
        const val = incoming[f];
        if (val !== undefined && val !== prev[f]) {
            next[f] = val;
            revisions.push({ key: datasetKey(f), value: val });
        }
    }
    if (incoming.tags && !valuesEqual(prev.tags, incoming.tags)) {
        next.tags = [...incoming.tags];
        revisions.push({ key: datasetKey('tags'), value: next.tags });
    }

    const incomingColumnNames = new Set<string>();
    const matchedColumns = new Set<string>();
    const skippedColumns = new Set<string>();

    for (const [mapKey, kind] of COLUMN_MAPS) {
        const incomingMap = incoming[mapKey];
        if (!incomingMap) continue;
        const merged = { ...prev[mapKey] };
        let changed = false;
        for (const [col, val] of Object.entries(incomingMap)) {
            incomingColumnNames.add(col);
            if (!allowedColumns.has(col)) {
                skippedColumns.add(col);
                continue;
            }
            matchedColumns.add(col);
            if (val !== merged[col]) {
                merged[col] = val;
                changed = true;
                revisions.push({ key: columnKey(col, kind), value: val });
            }
        }
        if (changed) next[mapKey] = merged;
    }

    return {
        next,
        revisions,
        skippedColumns: [...skippedColumns],
        matchedColumns: [...matchedColumns],
    };
}
