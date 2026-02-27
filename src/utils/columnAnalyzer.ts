import type { CategoricalStats, ColumnInfo, CsvRow, NumericStats, TextStats } from '../types';

export function analyzeColumn(_columnName: string, values: (string | null | undefined)[]): ColumnInfo {
    const nonNullValues = values.filter(
        (v): v is string => v !== null && v !== undefined && v !== ''
    );

    const nullCount = values.length - nonNullValues.length;
    const totalCount = values.length;

    if (nonNullValues.length === 0) {
        return {type: 'empty', stats: {}, nullCount, totalCount};
    }

    // Try to parse as numbers
    const numericValues = nonNullValues
        .map((v) => parseFloat(v))
        .filter((v) => !isNaN(v));

    if (numericValues.length / nonNullValues.length > 0.8) {
        // Numeric column
        numericValues.sort((a, b) => a - b);
        const stats: NumericStats = {
            count: numericValues.length,
            min: Math.min(...numericValues),
            max: Math.max(...numericValues),
            mean: numericValues.reduce((a, b) => a + b, 0) / numericValues.length,
            q1: numericValues[Math.floor(numericValues.length * 0.25)],
            median: numericValues[Math.floor(numericValues.length * 0.5)],
            q3: numericValues[Math.floor(numericValues.length * 0.75)],
        };
        return {type: 'numeric', stats, nullCount, totalCount};
    }

    // Check if categorical
    const uniqueValues = [...new Set(nonNullValues)];
    const uniqueRatio = uniqueValues.length / nonNullValues.length;

    if (uniqueRatio < 0.5 || uniqueValues.length < 50) {
        // Categorical column
        const stats: CategoricalStats = {
            count: nonNullValues.length,
            uniqueCount: uniqueValues.length,
            values: uniqueValues.slice(0, 20),
            hasMore: uniqueValues.length > 20,
        };
        return {type: 'categorical', stats, nullCount, totalCount};
    }

    // Text column
    const stats: TextStats = {
        count: nonNullValues.length,
        uniqueCount: uniqueValues.length,
        samples: nonNullValues.slice(0, 5),
    };
    return {type: 'text', stats, nullCount, totalCount};
}

export function formatColumnStats(info: ColumnInfo): string {
    if (info.type === 'numeric') {
        const stats = info.stats as NumericStats;
        return `Min: ${stats.min.toFixed(2)} | Max: ${stats.max.toFixed(2)} | Avg: ${stats.mean.toFixed(2)} | Median: ${stats.median.toFixed(2)}`;
    } else if (info.type === 'categorical') {
        const stats = info.stats as CategoricalStats;
        return `${stats.uniqueCount} unique values | Top: ${stats.values.slice(0, 3).join(', ')}`;
    } else if (info.type === 'text') {
        const stats = info.stats as TextStats;
        return `${stats.uniqueCount} unique values | ${stats.count} non-empty entries`;
    }
    return '';
}

export function getColumnStatsText(info: ColumnInfo): string {
    if (info.type === 'numeric') {
        const stats = info.stats as NumericStats;
        return `This is a numeric column with values ranging from ${stats.min.toFixed(2)} to ${stats.max.toFixed(2)}. Average: ${stats.mean.toFixed(2)}, Median: ${stats.median.toFixed(2)}, Q1: ${stats.q1.toFixed(2)}, Q3: ${stats.q3.toFixed(2)}.`;
    } else if (info.type === 'categorical') {
        const stats = info.stats as CategoricalStats;
        return `This is a categorical column with ${stats.uniqueCount} unique values: ${stats.values.join(', ')}${stats.hasMore ? ', and more' : ''}.`;
    } else if (info.type === 'text') {
        const stats = info.stats as TextStats;
        return `This is a text column with ${stats.uniqueCount} unique values. Sample values: ${stats.samples.slice(0, 3).join(', ')}.`;
    }
    return '';
}

export function buildSampleRows(data: CsvRow[], columns?: string[]): string {
    if (data.length === 0) return '(no data)';

    const cols = columns || Object.keys(data[0]);
    const displayCols = cols.slice(0, 15);
    const sampleData = data.slice(0, 5);

    const truncate = (val: string, maxLen: number = 60): string =>
        val.length > maxLen ? val.slice(0, maxLen - 3) + '...' : val;

    const header = displayCols.map(c => truncate(c)).join(' | ');
    const separator = displayCols.map(c => '-'.repeat(Math.min(c.length, 60))).join(' | ');
    const rows = sampleData.map(row =>
        displayCols.map(c => truncate(row[c] ?? '')).join(' | ')
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
    }
    return '';
}

export function sanitizeId(name: string): string {
    return name.replace(/[^a-zA-Z0-9]/g, '_');
}
