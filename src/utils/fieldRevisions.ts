import type { FieldRevision, FieldRevisionsMap, FieldRevisionSource, GeneratedResults, } from '../types';

const COALESCE_WINDOW_MS = 2000;

export type DatasetFieldKey =
    | 'datasetTitle'
    | 'datasetDescription'
    | 'rowLabel'
    | 'category'
    | 'tags'
    | 'licenseId'
    | 'attribution'
    | 'contactEmail'
    | 'periodOfTime'
    | 'postingFrequency';

export type ColumnFieldKind = 'description' | 'displayName' | 'fieldName';

export function datasetKey(field: DatasetFieldKey): string {
    return `dataset:${field}`;
}

export function columnKey(columnName: string, kind: ColumnFieldKind): string {
    return `column:${columnName}:${kind}`;
}

export function valuesEqual(a: string | string[], b: string | string[]): boolean {
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
        return true;
    }
    if (Array.isArray(a) || Array.isArray(b)) return false;
    return a === b;
}

function makeId(): string {
    return `rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneValue(v: string | string[]): string | string[] {
    return Array.isArray(v) ? [...v] : v;
}

/**
 * Append a revision unless it matches the current head. User-source edits made
 * within COALESCE_WINDOW_MS collapse into the previous user revision so a burst
 * of keystrokes does not flood history.
 */
export function appendRevision(
    map: FieldRevisionsMap,
    key: string,
    value: string | string[],
    source: FieldRevisionSource,
): FieldRevisionsMap {
    const existing = map[key] || [];
    const last = existing[existing.length - 1];

    if (last && valuesEqual(last.value, value)) {
        return map;
    }

    const now = Date.now();
    if (
        last
        && source === 'user'
        && last.source === 'user'
        && now - last.timestamp < COALESCE_WINDOW_MS
    ) {
        const replaced: FieldRevision = { ...last, value: cloneValue(value), timestamp: now };
        return { ...map, [key]: [...existing.slice(0, -1), replaced] };
    }

    const next: FieldRevision = {
        id: makeId(),
        value: cloneValue(value),
        source,
        timestamp: now,
    };
    return { ...map, [key]: [...existing, next] };
}

export function getRevisions(map: FieldRevisionsMap, key: string): FieldRevision[] {
    return map[key] || [];
}

/** Whether the user has produced any revision beyond the seeded 'original'. */
export function isFieldModified(map: FieldRevisionsMap, key: string): boolean {
    const list = map[key];
    return !!list && list.length > 1;
}

export function findRevision(
    map: FieldRevisionsMap,
    key: string,
    revisionId: string,
): FieldRevision | undefined {
    return (map[key] || []).find((r) => r.id === revisionId);
}

/**
 * Seed an 'original' revision for every tracked dataset and column field. Called
 * after a dataset finishes loading so subsequent edits show up as the second
 * entry in history.
 */
export function seedRevisions(
    results: GeneratedResults,
    columnNames: string[],
): FieldRevisionsMap {
    const map: FieldRevisionsMap = {};
    const ts = Date.now();
    const seed = (key: string, value: string | string[]) => {
        map[key] = [{
            id: makeId(),
            value: cloneValue(value),
            source: 'original',
            timestamp: ts,
        }];
    };

    seed(datasetKey('datasetTitle'), results.datasetTitle || '');
    seed(datasetKey('datasetDescription'), results.datasetDescription || '');
    seed(datasetKey('rowLabel'), results.rowLabel || '');
    seed(datasetKey('category'), results.category || '');
    seed(datasetKey('tags'), results.tags || []);
    seed(datasetKey('licenseId'), results.licenseId || '');
    seed(datasetKey('attribution'), results.attribution || '');
    seed(datasetKey('contactEmail'), results.contactEmail || '');
    seed(datasetKey('periodOfTime'), results.periodOfTime || '');
    seed(datasetKey('postingFrequency'), results.postingFrequency || '');

    for (const col of columnNames) {
        seed(columnKey(col, 'description'), results.columnDescriptions[col] || '');
        seed(columnKey(col, 'displayName'), results.columnDisplayNames[col] || '');
        seed(columnKey(col, 'fieldName'), results.columnFieldNames[col] || '');
    }

    return map;
}
