import type {
    CategoricalStats,
    ColumnInfo,
    CsvRow,
    GeospatialStats,
    NumericCategoricalSummary,
    NumericStats,
    OpaqueStats,
    TemporalStats,
    TextStats
} from '@/types';

/**
 * Summarise a number-backed categorical column's values as numbers, from the
 * exact value→frequency map both analysis paths already build. min/max/median/
 * mode are therefore exact for the low-cardinality columns this runs on.
 * Median uses the same sorted-index rule as the numeric branch; mode is the
 * most frequent value (ties resolved by first appearance). Returns null if no
 * value parses as a number.
 */
export function numericCategoricalSummary(
    counts: Map<string, number>
): NumericCategoricalSummary | null {
    const entries: { value: number; count: number }[] = [];
    let total = 0;
    let numSum = 0;
    let mode = 0;
    let modeCount = -1;
    for (const [raw, count] of counts) {
        const num = parseFloat(raw);
        if (Number.isNaN(num)) continue;
        entries.push({ value: num, count });
        total += count;
        numSum += num * count;
        if (count > modeCount) {
            modeCount = count;
            mode = num;
        }
    }
    if (entries.length === 0) return null;
    entries.sort((a, b) => a.value - b.value);

    // Median: walk cumulative frequency to the floor(total/2) index.
    const target = Math.floor(total * 0.5);
    let cumulative = 0;
    let median = entries[entries.length - 1].value;
    for (const { value, count } of entries) {
        cumulative += count;
        if (cumulative > target) {
            median = value;
            break;
        }
    }

    return {
        min: entries[0].value,
        avg: total > 0 ? numSum / total : 0,
        max: entries[entries.length - 1].value,
        median,
        mode,
    };
}

/** Compact number for stat lines: integers verbatim (codes/years/ratings),
 *  otherwise two decimals. */
function formatStatNumber(n: number): string {
    return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}

/** "Min: … | Avg: … | Max: … | Median: … | Mode: …" for a number-backed
 *  categorical, or '' when the column carries no numeric summary. */
export function formatNumericCategoricalSummary(stats: CategoricalStats): string {
    const s = stats.numericSummary;
    if (!s) return '';
    return `Min: ${ formatStatNumber(s.min) } | Avg: ${ formatStatNumber(s.avg) }`
        + ` | Max: ${ formatStatNumber(s.max) } | Median: ${ formatStatNumber(s.median) }`
        + ` | Mode: ${ formatStatNumber(s.mode) }`;
}

export function analyzeColumn(_columnName: string, values: (string | null | undefined)[]): ColumnInfo {
    const nonNullValues = values.filter(
        (v): v is string => v !== null && v !== undefined && v !== ''
    );

    const nullCount = values.length - nonNullValues.length;
    const totalCount = values.length;

    if (nonNullValues.length === 0) {
        return { type: 'empty', stats: {}, nullCount, totalCount };
    }

    // How many values parse as numbers? Used both to flag a (continuous)
    // numeric column and, for categorical columns, to tell a number-backed set
    // (ratings, FIPS codes, years) apart from free text.
    const numericValues = nonNullValues
        .map((v) => parseFloat(v))
        .filter((v) => !isNaN(v));
    const isNumericBase = numericValues.length / nonNullValues.length > 0.8;

    // Distinct-value distribution — drives the categorical check for both
    // number- and text-backed columns.
    const counts = new Map<string, number>();
    for (const v of nonNullValues) {
        counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const uniqueValues = [...counts.keys()];
    const uniqueRatio = uniqueValues.length / nonNullValues.length;

    // Categorical when values repeat heavily or the distinct set is small.
    // Checked before the numeric branch so a low-cardinality number column
    // (e.g. a 1–5 rating, a status code) is recognised as categorical rather
    // than summarised with a meaningless min/max/mean.
    if (uniqueRatio < 0.5 || uniqueValues.length < 50) {
        // Sort by frequency desc so `values[0..n]` is actually the top-n
        // (mirrors the Socrata backend's group-by order).
        const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        const top = sorted.slice(0, 20);
        const stats: CategoricalStats = {
            count: nonNullValues.length,
            uniqueCount: uniqueValues.length,
            values: top.map(([v]) => v),
            valueCounts: top.map(([, c]) => c),
            hasMore: uniqueValues.length > 20,
        };
        // A number-backed categorical (rating, FIPS/status code, year) still
        // benefits from min/max/median/mode alongside the distinct-value list.
        if (isNumericBase) {
            const summary = numericCategoricalSummary(counts);
            if (summary) stats.numericSummary = summary;
        }
        return {
            type: 'categorical',
            baseType: isNumericBase ? 'numeric' : 'text',
            stats,
            nullCount,
            totalCount,
        };
    }

    if (isNumericBase) {
        // Numeric column — high enough cardinality that the distribution, not
        // the distinct set, is what's worth summarising.
        numericValues.sort((a, b) => a - b);
        // Mode from the counts map (same map used for the categorical check above).
        let modeValue = numericValues[0];
        let modeFreq = -1;
        for (const [raw, freq] of counts) {
            const num = parseFloat(raw);
            if (!isNaN(num) && freq > modeFreq) {
                modeFreq = freq;
                modeValue = num;
            }
        }
        const stats: NumericStats = {
            count: numericValues.length,
            min: numericValues[0],
            max: numericValues[numericValues.length - 1],
            mean: numericValues.reduce((a, b) => a + b, 0) / numericValues.length,
            q1: numericValues[Math.floor(numericValues.length * 0.25)],
            median: numericValues[Math.floor(numericValues.length * 0.5)],
            q3: numericValues[Math.floor(numericValues.length * 0.75)],
            mode: modeValue,
        };
        return { type: 'numeric', stats, nullCount, totalCount };
    }

    // Text column
    const stats: TextStats = {
        count: nonNullValues.length,
        uniqueCount: uniqueValues.length,
        samples: nonNullValues.slice(0, 5),
    };
    return { type: 'text', stats, nullCount, totalCount };
}

// A few Socrata types already announce their categorical nature (a checkbox is
// always true/false), so we keep showing those verbatim rather than flattening
// them to "Text (Categorical)".
const SELF_DESCRIBING_CATEGORICAL = new Set(['checkbox', 'flag']);

// Human-facing type label. For categorical columns this surfaces the underlying
// base type — "Number (Categorical)" / "Text (Categorical)" — so the chip says
// both *what* the values are and *that* they form a small set. Non-categorical
// columns keep their original Socrata type (when present) or the detected type.
// Accepts the loose shape shared by ColumnInfo and DataTypeBadge's props.
export function getColumnTypeLabel(
    info: { type: string; originalType?: string; baseType?: 'numeric' | 'text' }
): string {
    if (info.type === 'categorical') {
        if (info.originalType && SELF_DESCRIBING_CATEGORICAL.has(info.originalType.toLowerCase())) {
            return info.originalType;
        }
        const base = info.baseType === 'numeric' ? 'Number' : 'Text';
        return `${ base } (Categorical)`;
    }
    return info.originalType || info.type;
}

function formatTemporalForDisplay(value: string): string {
    // Socrata temporal values arrive as ISO-like strings (e.g.
    // "1995-01-04T00:00:00.000"). Render them as "Jan 4, 1995" for the UI;
    // fall back to the raw string if it doesn't parse.
    const datePart = value.split('T')[0];
    const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return value;
    const [, y, m, d] = match;
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    if (isNaN(dt.getTime())) return value;
    return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatColumnStats(info: ColumnInfo): string {
    if (info.type === 'numeric') {
        const stats = info.stats as NumericStats;
        return `Min: ${ formatStatNumber(stats.min) } | Avg: ${ formatStatNumber(stats.mean) } | Max: ${ formatStatNumber(stats.max) } | Median: ${ formatStatNumber(stats.median) } | Mode: ${ formatStatNumber(stats.mode) }`;
    } else if (info.type === 'categorical') {
        const stats = info.stats as CategoricalStats;
        const top = stats.values.slice(0, 5).map((v, i) => {
            const cnt = stats.valueCounts?.[i];
            if (cnt === undefined || stats.count === 0) return v;
            const pct = (cnt / stats.count) * 100;
            const rounded = pct >= 10 ? pct.toFixed(0) : pct.toFixed(1);
            return `${ v } (${ rounded }%)`;
        });
        const summary = formatNumericCategoricalSummary(stats);
        return `${ stats.uniqueCount } unique values | Top: ${ top.join(', ') }`
            + (summary ? ` | ${ summary }` : '');
    } else if (info.type === 'text') {
        const stats = info.stats as TextStats;
        return `${ stats.uniqueCount } unique values | ${ stats.count } non-empty entries`;
    } else if (info.type === 'temporal') {
        const stats = info.stats as TemporalStats;
        return `Range: ${ formatTemporalForDisplay(stats.min) } – ${ formatTemporalForDisplay(stats.max) } | ${ stats.count } non-empty entries`;
    } else if (info.type === 'geospatial') {
        const stats = info.stats as GeospatialStats;
        return `${ stats.count } ${ stats.geometryType } geometries`;
    } else if (info.type === 'opaque') {
        const stats = info.stats as OpaqueStats;
        return `${ stats.count } non-empty entries (binary/reference type — not sampled)`;
    }
    return '';
}

export function getColumnStatsText(info: ColumnInfo): string {
    if (info.type === 'numeric') {
        const stats = info.stats as NumericStats;
        return `This is a numeric column with values ranging from ${ formatStatNumber(stats.min) } to ${ formatStatNumber(stats.max) }. Avg: ${ formatStatNumber(stats.mean) }, Median: ${ formatStatNumber(stats.median) }, Mode: ${ formatStatNumber(stats.mode) }, Q1: ${ stats.q1.toFixed(2) }, Q3: ${ stats.q3.toFixed(2) }.`;
    } else if (info.type === 'categorical') {
        const stats = info.stats as CategoricalStats;
        const labeled = stats.values.map((v, i) => {
            const cnt = stats.valueCounts?.[i];
            if (cnt === undefined || stats.count === 0) return v;
            const pct = (cnt / stats.count) * 100;
            const rounded = pct >= 10 ? pct.toFixed(0) : pct.toFixed(1);
            return `${ v } (${ rounded }%)`;
        });
        const summary = stats.numericSummary
            ? ` As numbers: min ${ formatStatNumber(stats.numericSummary.min) }, avg ${ formatStatNumber(stats.numericSummary.avg) }, max ${ formatStatNumber(stats.numericSummary.max) }, median ${ formatStatNumber(stats.numericSummary.median) }, mode ${ formatStatNumber(stats.numericSummary.mode) }.`
            : '';
        return `This is a categorical column with ${ stats.uniqueCount } unique values: ${ labeled.join(', ') }${ stats.hasMore ? ', and more' : '' }.${ summary }`;
    } else if (info.type === 'text') {
        const stats = info.stats as TextStats;
        return `This is a text column with ${ stats.uniqueCount } unique values. Sample values: ${ stats.samples.slice(0, 3).join(', ') }.`;
    } else if (info.type === 'temporal') {
        const stats = info.stats as TemporalStats;
        return `This is a date/time column with ${ stats.count } non-empty values, ranging from ${ stats.min } to ${ stats.max }.`;
    } else if (info.type === 'geospatial') {
        const stats = info.stats as GeospatialStats;
        return `This is a geospatial column containing ${ stats.count } non-empty ${ stats.geometryType } geometries.`;
    } else if (info.type === 'opaque') {
        const stats = info.stats as OpaqueStats;
        return `This column contains ${ stats.count } non-empty entries. Values are binary references (document/photo/link) and are not sampled.`;
    }
    return '';
}

export function buildSampleRows(data: CsvRow[], columns?: string[]): string {
    if (data.length === 0) return '(no data)';

    const cols = columns || Object.keys(data[0]);
    const displayCols = cols.slice(0, 15);
    const sampleData = data.slice(0, 5);

    const truncate = (val: unknown, maxLen: number = 60): string => {
        // Socrata sample rows can contain non-string values (geospatial Point
        // objects, numbers, booleans). Coerce here so .replace doesn't blow up.
        const str = val == null
            ? ''
            : typeof val === 'object'
                ? JSON.stringify(val)
                : String(val);
        // Collapse internal whitespace so an injected newline in one cell
        // can't visually break the row apart and impersonate a new instruction.
        const oneLine = str.replace(/\s+/g, ' ');
        return oneLine.length > maxLen ? oneLine.slice(0, maxLen - 3) + '...' : oneLine;
    };

    const header = displayCols.map(c => truncate(c)).join(' | ');
    const separator = displayCols.map(c => '-'.repeat(Math.min(c.length, 60))).join(' | ');
    const rows = sampleData.map(row =>
        displayCols.map(c => truncate(row[c])).join(' | ')
    );

    return [header, separator, ...rows].join('\n');
}

export function getSampleCount(data: CsvRow[]): number {
    return Math.min(5, data.length);
}

export function getSampleValues(info: ColumnInfo, values: (string | null | undefined)[]): string {
    if (info.type === 'numeric') {
        const nonNull = values.filter((v): v is string => v !== null && v !== undefined && v !== '');
        return nonNull.slice(0, 5).join(', ');
    } else if (info.type === 'categorical') {
        const stats = info.stats as CategoricalStats;
        return stats.values.slice(0, 10).join(', ') + (stats.hasMore ? ', ...' : '');
    } else if (info.type === 'text') {
        const stats = info.stats as TextStats;
        return stats.samples.slice(0, 5).join('; ');
    } else if (info.type === 'temporal') {
        const stats = info.stats as TemporalStats;
        return `Earliest: ${ stats.min }; Latest: ${ stats.max }`;
    } else if (info.type === 'geospatial') {
        const stats = info.stats as GeospatialStats;
        return `(${ stats.count } ${ stats.geometryType } geometries — individual values not sampled)`;
    } else if (info.type === 'opaque') {
        const stats = info.stats as OpaqueStats;
        return `(${ stats.count } non-empty values — binary/reference type, not sampled)`;
    }
    return '';
}

export function sanitizeId(name: string): string {
    return name.replace(/[^a-zA-Z0-9]/g, '_');
}
