import type { CategoricalStats, ColumnInfo, CsvRow, NumericStats, TextStats } from '../types';

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
