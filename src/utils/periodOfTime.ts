export const PERIOD_MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const MONTH_LOOKUP: Record<string, number> = PERIOD_MONTHS.reduce((acc, name, i) => {
    acc[name.toLowerCase()] = i + 1;
    acc[name.slice(0, 3).toLowerCase()] = i + 1;
    return acc;
}, {} as Record<string, number>);

export interface PeriodSide {
    year: string;
    month: string;
    day: string;
}

export interface PeriodState {
    start: PeriodSide;
    end: PeriodSide;
    endIsPresent: boolean;
}

export const EMPTY_PERIOD_SIDE: PeriodSide = { year: '', month: '', day: '' };
export const EMPTY_PERIOD_STATE: PeriodState = {
    start: EMPTY_PERIOD_SIDE,
    end: EMPTY_PERIOD_SIDE,
    endIsPresent: false,
};

export function periodDaysInMonth(year: string, month: string): number {
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    if (!y || !m) return 31;
    return new Date(y, m, 0).getDate();
}

function formatSide(side: PeriodSide): string {
    if (!side.year) return '';
    const monthIdx = parseInt(side.month, 10) - 1;
    const monthName = monthIdx >= 0 && monthIdx < PERIOD_MONTHS.length ? PERIOD_MONTHS[monthIdx] : '';
    if (!monthName) return side.year;
    const dayNum = parseInt(side.day, 10);
    if (!dayNum || dayNum < 1 || dayNum > periodDaysInMonth(side.year, side.month)) {
        return `${monthName} ${side.year}`;
    }
    return `${monthName} ${dayNum}, ${side.year}`;
}

export function periodStateToString(state: PeriodState): string {
    const startStr = formatSide(state.start);
    const endStr = state.endIsPresent ? 'present' : formatSide(state.end);
    if (!startStr && !endStr) return '';
    if (!startStr) return `to ${endStr}`;
    if (!endStr) return startStr;
    return `${startStr} to ${endStr}`;
}

function clampDay(year: string, month: string, day: string): string {
    if (!day || !month || !year) return day;
    const d = parseInt(day, 10);
    const max = periodDaysInMonth(year, month);
    if (d < 1 || d > max) return '';
    return String(d);
}

const SCHOOL_YEAR_LABEL_RE = /\s*(?:^|\s)(?:school\s+year|sy|academic\s+year|ay)\s*$|^\s*(?:school\s+year|sy|academic\s+year|ay)\s+/i;

function stripSchoolYearLabel(text: string): string {
    return text.replace(SCHOOL_YEAR_LABEL_RE, ' ').trim();
}

/**
 * Parse academic shorthand 'YYYY-YY' (e.g. '2022-23') as a year range when the
 * trailing 2-digit suffix is exactly one greater than the leading year's last
 * two digits. Returns [startYear, endYear] strings, or null.
 */
function parseSchoolYearShorthand(text: string): [string, string] | null {
    const m = text.trim().match(/^(\d{4})\s*[-/–—]\s*(\d{2})$/);
    if (!m) return null;
    const startYear = parseInt(m[1], 10);
    const suffix = parseInt(m[2], 10);
    const expected = (startYear + 1) % 100;
    if (suffix !== expected) return null;
    const endYear = startYear + 1;
    return [String(startYear), String(endYear)];
}

function parseSide(text: string): PeriodSide | null {
    const stripped = stripSchoolYearLabel(text);
    const trimmed = stripped.trim().replace(/^[([]|[)\]]$/g, '').trim();
    if (!trimmed) return null;

    const monthDayYear = trimmed.match(/^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/);
    if (monthDayYear) {
        const m = MONTH_LOOKUP[monthDayYear[1].toLowerCase()];
        if (m) {
            const day = clampDay(monthDayYear[3], String(m), monthDayYear[2]);
            return { year: monthDayYear[3], month: String(m), day };
        }
    }

    const monthYear = trimmed.match(/^([A-Za-z]+)\.?\s+(\d{4})$/);
    if (monthYear) {
        const m = MONTH_LOOKUP[monthYear[1].toLowerCase()];
        if (m) return { year: monthYear[2], month: String(m), day: '' };
    }

    const isoYmd = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (isoYmd) {
        const m = parseInt(isoYmd[2], 10);
        if (m >= 1 && m <= 12) {
            const day = clampDay(isoYmd[1], String(m), isoYmd[3]);
            return { year: isoYmd[1], month: String(m), day };
        }
    }

    const mdy = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (mdy) {
        const m = parseInt(mdy[1], 10);
        if (m >= 1 && m <= 12) {
            const day = clampDay(mdy[3], String(m), mdy[2]);
            return { year: mdy[3], month: String(m), day };
        }
    }

    const ymOnly = trimmed.match(/^(\d{4})[-/.](\d{1,2})$/);
    if (ymOnly) {
        const m = parseInt(ymOnly[2], 10);
        if (m >= 1 && m <= 12) return { year: ymOnly[1], month: String(m), day: '' };
    }

    const myOnly = trimmed.match(/^(\d{1,2})[-/.](\d{4})$/);
    if (myOnly) {
        const m = parseInt(myOnly[1], 10);
        if (m >= 1 && m <= 12) return { year: myOnly[2], month: String(m), day: '' };
    }

    const yearOnly = trimmed.match(/^(\d{4})$/);
    if (yearOnly) return { year: yearOnly[1], month: '', day: '' };

    return null;
}

const PRESENT_TOKENS = new Set(['present', 'the present', 'now', 'today', 'current', 'ongoing']);

function splitRange(value: string): [string, string] | null {
    const spaced = value.split(/\s+(?:to|through|until|thru|–|—|-)\s+/i);
    if (spaced.length === 2) return [spaced[0], spaced[1]];

    const yearRange = value.trim().match(/^(\d{4})\s*[-–—]\s*(\d{4})$/);
    if (yearRange) return [yearRange[1], yearRange[2]];

    const yearToPresent = value.trim().match(/^(\d{4})\s*[-–—]\s*(present|now|today|current|ongoing)$/i);
    if (yearToPresent) return [yearToPresent[1], yearToPresent[2]];

    return null;
}

function yearSide(year: string): PeriodSide {
    return { year, month: '', day: '' };
}

export function periodStringToState(value: string): PeriodState {
    if (!value) return EMPTY_PERIOD_STATE;
    const stripped = stripSchoolYearLabel(value);
    if (!stripped) return EMPTY_PERIOD_STATE;

    // School-year shorthand on the whole value: "2022-23" means academic year
    // 2022 → 2023, which is a range, not a single side.
    const wholeSchool = parseSchoolYearShorthand(stripped);
    if (wholeSchool) {
        return {
            start: yearSide(wholeSchool[0]),
            end: yearSide(wholeSchool[1]),
            endIsPresent: false,
        };
    }

    const parts = splitRange(stripped);
    if (!parts) {
        const single = parseSide(value);
        if (!single) return EMPTY_PERIOD_STATE;
        return { start: single, end: EMPTY_PERIOD_SIDE, endIsPresent: false };
    }

    // School-year range: "2017-18 to 2024-25" → start year of first, end year of second.
    const startSchool = parseSchoolYearShorthand(stripSchoolYearLabel(parts[0]));
    const endText = parts[1].trim().toLowerCase();
    if (startSchool) {
        if (PRESENT_TOKENS.has(endText)) {
            return { start: yearSide(startSchool[0]), end: EMPTY_PERIOD_SIDE, endIsPresent: true };
        }
        const endSchool = parseSchoolYearShorthand(stripSchoolYearLabel(parts[1]));
        if (endSchool) {
            return {
                start: yearSide(startSchool[0]),
                end: yearSide(endSchool[1]),
                endIsPresent: false,
            };
        }
    }

    const startSide = parseSide(parts[0]);
    if (!startSide) return EMPTY_PERIOD_STATE;
    if (PRESENT_TOKENS.has(endText)) {
        return { start: startSide, end: EMPTY_PERIOD_SIDE, endIsPresent: true };
    }
    const endSide = parseSide(parts[1]);
    if (!endSide) return EMPTY_PERIOD_STATE;
    return { start: startSide, end: endSide, endIsPresent: false };
}

export function canParsePeriodString(value: string): boolean {
    if (!value || !value.trim()) return true;
    const state = periodStringToState(value);
    return !!state.start.year || state.endIsPresent;
}

function isoTokenToSide(token: string): PeriodSide | null {
    if (!token) return null;
    const cleaned = token.trim();
    const ymd = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (ymd) {
        const m = parseInt(ymd[2], 10);
        if (m < 1 || m > 12) return null;
        const day = clampDay(ymd[1], String(m), ymd[3]);
        return { year: ymd[1], month: String(m), day };
    }
    const ym = cleaned.match(/^(\d{4})-(\d{1,2})$/);
    if (ym) {
        const m = parseInt(ym[2], 10);
        if (m < 1 || m > 12) return null;
        return { year: ym[1], month: String(m), day: '' };
    }
    const y = cleaned.match(/^(\d{4})$/);
    if (y) {
        return { year: y[1], month: '', day: '' };
    }
    return null;
}

export function parsePeriodOfTimeResponse(raw: string): string {
    const text = raw.trim();
    if (!text) return '';

    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) return '';
        try {
            parsed = JSON.parse(match[0]);
        } catch {
            return '';
        }
    }

    if (!parsed || typeof parsed !== 'object') return '';
    const obj = parsed as {start?: unknown; end?: unknown};
    const startRaw = typeof obj.start === 'string' ? obj.start : '';
    const endRaw = typeof obj.end === 'string' ? obj.end : '';

    const startSide = isoTokenToSide(startRaw) ?? EMPTY_PERIOD_SIDE;
    const endIsPresent = endRaw.trim().toLowerCase() === 'present';
    const endSide = endIsPresent ? EMPTY_PERIOD_SIDE : (isoTokenToSide(endRaw) ?? EMPTY_PERIOD_SIDE);

    return periodStateToString({ start: startSide, end: endSide, endIsPresent });
}
