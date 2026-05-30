import type { CategoricalStats, ColumnInfo, CsvRow, NumericStats, TemporalStats, TextStats, } from '@/types';
import { periodStringToState } from '@/utils/periodOfTime';
import { sanitizeInline } from '@/utils/prompts';

// Bounds for what counts as a plausible calendar year. Anything outside this is
// almost certainly an id, code, count, or measurement — not a date.
const YEAR_MIN = 1700;
const YEAR_MAX = new Date().getFullYear() + 5;

const MONTHS: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
    september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

// A column name must look temporal before we'll treat bare 4-digit numbers in it
// as years — otherwise zip prefixes, model numbers, or counts get misread.
const YEAR_NAME_RE = /(^|[^a-z])(year|yr|fy|fiscal|vintage|reporting.?period|school.?year|academic.?year)([^a-z]|$)/i;

interface ParsedDate {
    y: number;
    m?: number;
    d?: number;
}

function validYMD(y: number, m: number, d: number): boolean {
    return y >= YEAR_MIN && y <= YEAR_MAX && m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

function validYM(y: number, m: number): boolean {
    return y >= YEAR_MIN && y <= YEAR_MAX && m >= 1 && m <= 12;
}

// Parse a single cell into a date with whatever precision it actually carries.
// Pure 4-digit years are intentionally NOT handled here (see parsePureYear) so
// that arbitrary numbers don't get mistaken for dates.
function parseCellDate(raw: string): ParsedDate | null {
    const s = raw.trim();
    if (!s) return null;

    // ISO date or datetime: 2020-03-15, 2020-03-15T00:00:00.000
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]\d.*)?$/);
    if (m) {
        const y = +m[1], mo = +m[2], d = +m[3];
        if (validYMD(y, mo, d)) return { y, m: mo, d };
    }
    // ISO year-month: 2020-03
    m = s.match(/^(\d{4})-(\d{1,2})$/);
    if (m) {
        const y = +m[1], mo = +m[2];
        if (validYM(y, mo)) return { y, m: mo };
    }
    // US slash MDY: 3/15/2020
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
        const mo = +m[1], d = +m[2], y = +m[3];
        if (validYMD(y, mo, d)) return { y, m: mo, d };
    }
    // Slash YMD: 2020/03/15
    m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (m) {
        const y = +m[1], mo = +m[2], d = +m[3];
        if (validYMD(y, mo, d)) return { y, m: mo, d };
    }
    // Dash MDY: 3-15-2020
    m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (m) {
        const mo = +m[1], d = +m[2], y = +m[3];
        if (validYMD(y, mo, d)) return { y, m: mo, d };
    }
    // Month name with day: March 15, 2020 / Mar 15 2020
    m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/);
    if (m) {
        const mo = MONTHS[m[1].toLowerCase()];
        const d = +m[2], y = +m[3];
        if (mo && validYMD(y, mo, d)) return { y, m: mo, d };
    }
    // Month name with year: March 2020
    m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{4})$/);
    if (m) {
        const mo = MONTHS[m[1].toLowerCase()];
        const y = +m[2];
        if (mo && validYM(y, mo)) return { y, m: mo };
    }
    return null;
}

function parsePureYear(raw: string): number | null {
    const m = raw.trim().match(/^(\d{4})(?:\.0+)?$/);
    if (!m) return null;
    const y = +m[1];
    return y >= YEAR_MIN && y <= YEAR_MAX ? y : null;
}

function dateKey(p: ParsedDate): number {
    return p.y * 10000 + (p.m ?? 0) * 100 + (p.d ?? 0);
}

function labelOf(p: ParsedDate): string {
    const mm = p.m ? String(p.m).padStart(2, '0') : null;
    const dd = p.d ? String(p.d).padStart(2, '0') : null;
    if (mm && dd) return `${p.y}-${mm}-${dd}`;
    if (mm) return `${p.y}-${mm}`;
    return String(p.y);
}

interface DateScan {
    min: ParsedDate;
    max: ParsedDate;
    precision: 'day' | 'month' | 'year';
}

// Treat a list of values as a date column only when a clear majority parse as
// dates — a few stray date-looking values in a text column shouldn't qualify.
function detectDateColumn(values: string[]): DateScan | null {
    let parsed = 0;
    let total = 0;
    let min: ParsedDate | null = null;
    let max: ParsedDate | null = null;
    let minKey = Infinity;
    let maxKey = -Infinity;
    let allHaveDay = true;
    let allHaveMonth = true;

    for (const v of values) {
        if (v == null || v === '') continue;
        total++;
        const p = parseCellDate(v);
        if (!p) continue;
        parsed++;
        const key = dateKey(p);
        if (key < minKey) {
            minKey = key;
            min = p;
        }
        if (key > maxKey) {
            maxKey = key;
            max = p;
        }
        if (p.d == null) allHaveDay = false;
        if (p.m == null) allHaveMonth = false;
    }

    if (total === 0 || parsed === 0 || !min || !max) return null;
    if (parsed / total < 0.6) return null;
    const precision = allHaveDay ? 'day' : allHaveMonth ? 'month' : 'year';
    return { min, max, precision };
}

function detectYearColumn(name: string, values: string[]): {minYear: number; maxYear: number} | null {
    if (!YEAR_NAME_RE.test(name)) return null;
    let parsed = 0;
    let total = 0;
    let min = Infinity;
    let max = -Infinity;
    for (const v of values) {
        if (v == null || v === '') continue;
        total++;
        const y = parsePureYear(v);
        if (y == null) continue;
        parsed++;
        if (y < min) min = y;
        if (y > max) max = y;
    }
    if (total === 0 || parsed === 0) return null;
    if (parsed / total < 0.8) return null;
    return { minYear: min, maxYear: max };
}

export interface TemporalColumn {
    name: string;
    kind: 'date' | 'year';
    minLabel: string;
    maxLabel: string;
    minYear: number;
    maxYear: number;
    precision: 'day' | 'month' | 'year';
}

export interface TemporalCoverage {
    columns: TemporalColumn[];
    hasSignal: boolean;
    dataMinYear?: number;
    dataMaxYear?: number;
}

// Deterministically work out which columns carry real dates/years and what
// span they cover. Authoritative full-dataset ranges come from precomputed
// stats when present (Socrata temporal/numeric columns); otherwise we scan the
// available values (the full data for CSV uploads, samples + stats otherwise).
export function analyzeTemporalCoverage(
    data: CsvRow[],
    stats: Record<string, ColumnInfo>,
): TemporalCoverage {
    const columns: TemporalColumn[] = [];
    const names = Object.keys(stats).length
        ? Object.keys(stats)
        : data[0] ? Object.keys(data[0]) : [];

    for (const name of names) {
        const info = stats[name];

        // 1. Precomputed temporal stats (full-dataset min/max from the backend).
        if (info?.type === 'temporal') {
            const t = info.stats as TemporalStats;
            const min = parseCellDate(String(t.min));
            const max = parseCellDate(String(t.max));
            if (min && max) {
                const precision = min.d != null && max.d != null
                    ? 'day'
                    : min.m != null && max.m != null ? 'month' : 'year';
                columns.push({
                    name, kind: 'date', minLabel: labelOf(min), maxLabel: labelOf(max),
                    minYear: min.y, maxYear: max.y, precision,
                });
                continue;
            }
        }

        // 2. Numeric column that names itself a year (full min/max from stats).
        if (info?.type === 'numeric' && YEAR_NAME_RE.test(name)) {
            const n = info.stats as NumericStats;
            if (Number.isInteger(n.min) && Number.isInteger(n.max)
                && n.min >= YEAR_MIN && n.max <= YEAR_MAX) {
                columns.push({
                    name, kind: 'year', minLabel: String(n.min), maxLabel: String(n.max),
                    minYear: n.min, maxYear: n.max, precision: 'year',
                });
                continue;
            }
        }

        // 3. Scan text-like columns. Numeric/geospatial/opaque/empty can't carry
        //    parseable dates here, so skip them to bound the work on large files.
        if (info && info.type !== 'categorical' && info.type !== 'text') continue;

        const scanVals: string[] = [];
        for (const row of data) {
            const v = row[name];
            if (v != null && v !== '') scanVals.push(String(v));
        }
        if (info?.type === 'categorical') {
            for (const v of (info.stats as CategoricalStats).values) scanVals.push(v);
        } else if (info?.type === 'text') {
            for (const v of (info.stats as TextStats).samples) scanVals.push(v);
        }
        if (scanVals.length === 0) continue;

        const date = detectDateColumn(scanVals);
        if (date) {
            columns.push({
                name, kind: 'date', minLabel: labelOf(date.min), maxLabel: labelOf(date.max),
                minYear: date.min.y, maxYear: date.max.y, precision: date.precision,
            });
            continue;
        }
        const year = detectYearColumn(name, scanVals);
        if (year) {
            columns.push({
                name, kind: 'year', minLabel: String(year.minYear), maxLabel: String(year.maxYear),
                minYear: year.minYear, maxYear: year.maxYear, precision: 'year',
            });
        }
    }

    const hasSignal = columns.length > 0;
    return {
        columns,
        hasSignal,
        dataMinYear: hasSignal ? Math.min(...columns.map((c) => c.minYear)) : undefined,
        dataMaxYear: hasSignal ? Math.max(...columns.map((c) => c.maxYear)) : undefined,
    };
}

// Self-contained prompt section: the detected ranges plus the guidance that
// makes the model lean on them instead of guessing from a handful of sample
// rows. Used both to fill the {temporalSummary} placeholder and as an appended
// fallback for older saved templates that predate the placeholder.
export function buildTemporalSummary(coverage: TemporalCoverage, now: Date = new Date()): string {
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const heading = `Date and year fields detected in the data (TRUSTED — computed by the application from the dataset's actual values, not inferred by you). Today's date is ${todayIso}:`;
    const body = coverage.hasSignal
        ? coverage.columns.map((c) => {
            const kind = c.kind === 'year'
                ? 'year field'
                : `date field, ${c.precision}-level precision`;
            return `- "${sanitizeInline(c.name)}" (${kind}): full range ${c.minLabel} to ${c.maxLabel}`;
        }).join('\n')
        : '- (none found)';

    const guidance = coverage.hasSignal
        ? 'For each date or year field, use its full range (earliest to latest) shown above as the time span — do NOT read the span off the example values in the sample rows, which show only a handful of records. Choose the field(s) that represent when the data\'s events or observations occurred, and ignore unrelated dates (for example a row\'s last-updated timestamp or a person\'s birth year). Never report a start earlier, or a concrete end later, than these ranges support. If the latest date above falls within about the last year of today\'s date, the data is being kept current — set "end" to "present" instead of that trailing date.'
        : 'No date or year fields could be detected in this dataset. There is no reliable basis for a time span — return {"start": "", "end": ""} rather than guessing one from the sample rows.';

    return `${heading}\n${body}\n\n${guidance}`;
}

// Surface, after the fact, when a Period of Time value isn't actually supported
// by the data — either because nothing datelike was found, or because the value
// reaches outside every detected date/year range.
export function getPeriodOfTimeWarning(coverage: TemporalCoverage, periodValue: string): string | null {
    const value = (periodValue ?? '').trim();

    if (!coverage.hasSignal) {
        return value
            ? 'No date or year fields were detected in this data, so this Period of Time can\'t be verified against the data. Confirm it\'s correct or clear it.'
            : 'No date or year fields were detected in this data. A Period of Time can\'t be derived from the data automatically — set it manually if you know the coverage.';
    }

    if (!value) return null;

    const state = periodStringToState(value);
    const startYear = parseInt(state.start.year, 10);
    const endYear = state.endIsPresent ? NaN : parseInt(state.end.year || '', 10);
    const issues: string[] = [];
    if (!Number.isNaN(startYear) && coverage.dataMinYear !== undefined && startYear < coverage.dataMinYear) {
        issues.push(`starts in ${startYear}, before the earliest date found in the data (${coverage.dataMinYear})`);
    }
    if (!Number.isNaN(endYear) && coverage.dataMaxYear !== undefined && endYear > coverage.dataMaxYear) {
        issues.push(`ends in ${endYear}, after the latest date found in the data (${coverage.dataMaxYear})`);
    }
    if (issues.length === 0) return null;

    return `This Period of Time ${issues.join(', and ')}. Double-check it against the source — dates in this data span ${coverage.dataMinYear}–${coverage.dataMaxYear}.`;
}
