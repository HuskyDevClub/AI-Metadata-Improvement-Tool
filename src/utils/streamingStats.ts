import type { CategoricalStats, ColumnInfo, NumericStats, TextStats, } from '@/types';
import { numericCategoricalSummary } from '@/utils/columnAnalyzer';

// These mirror the thresholds in `analyzeColumn` (src/utils/columnAnalyzer.ts)
// exactly, so a streamed column produces the same ColumnInfo shape/branching as
// the in-memory path. Keep them in sync if analyzeColumn changes.
const NUMERIC_BASE_RATIO = 0.8;
const CATEGORICAL_UNIQUE_RATIO = 0.5;
const CATEGORICAL_MAX_DISTINCT = 50;
const TOP_VALUES = 20;
const TEXT_SAMPLES = 5;

// How many distinct values a column may hold before we stop tracking new ones
// exactly. Below this, distinct count and per-value frequencies are exact (which
// covers virtually every real categorical/text column); above it we fall back to
// the KMV cardinality estimate and the frequencies of the first K distinct values.
export const FREQUENCY_MAP_CAPACITY = 10_000;
// Reservoir of numeric values used only for the quartile estimates. min/max/mean
// stay exact (running). When a column has <= this many numeric values the
// reservoir holds them all, so quartiles are exact too.
export const RESERVOIR_CAPACITY = 20_000;
// Number of smallest hashes kept by the KMV cardinality estimator. ~1/sqrt(k)
// relative error, so 1024 ≈ 3%. Only consulted for columns past the frequency cap.
export const KMV_SIZE = 1_024;

/** FNV-1a 32-bit hash, normalised to [0, 1) for the KMV estimator. */
function normalizedHash(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0) / 4294967296;
}

/**
 * K-Minimum-Values distinct-count estimator. Keeps the `k` smallest distinct
 * hash values in a binary max-heap; the k-th smallest gives an unbiased estimate
 * of cardinality via (k - 1) / max. Bounded to O(k) memory regardless of input.
 */
class KmvCardinality {
    private readonly k: number;
    // Max-heap (largest at index 0) of the k smallest hashes seen so far.
    private readonly heap: number[] = [];
    // Membership of the hashes currently in the heap, to dedupe distinct values.
    private readonly present = new Set<number>();

    constructor(k: number = KMV_SIZE) {
        this.k = k;
    }

    add(value: string): void {
        const h = normalizedHash(value);
        if (this.present.has(h)) return;
        if (this.heap.length < this.k) {
            this.present.add(h);
            this.heap.push(h);
            this.siftUp(this.heap.length - 1);
            return;
        }
        // Heap full: keep only hashes smaller than the current max.
        if (h < this.heap[0]) {
            this.present.delete(this.heap[0]);
            this.present.add(h);
            this.heap[0] = h;
            this.siftDown(0);
        }
    }

    estimate(): number {
        // Fewer than k distinct hashes seen → the count is exact.
        if (this.heap.length < this.k) return this.heap.length;
        const kthSmallest = this.heap[0];
        if (kthSmallest <= 0) return this.heap.length;
        return Math.round((this.k - 1) / kthSmallest);
    }

    private siftUp(i: number): void {
        const h = this.heap;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (h[parent] >= h[i]) break;
            [h[parent], h[i]] = [h[i], h[parent]];
            i = parent;
        }
    }

    private siftDown(i: number): void {
        const h = this.heap;
        const n = h.length;
        for (; ;) {
            const l = 2 * i + 1;
            const r = 2 * i + 2;
            let largest = i;
            if (l < n && h[l] > h[largest]) largest = l;
            if (r < n && h[r] > h[largest]) largest = r;
            if (largest === i) break;
            [h[largest], h[i]] = [h[i], h[largest]];
            i = largest;
        }
    }
}

/**
 * Uniform reservoir sample of numeric values. Used purely to estimate quartiles
 * on huge columns; holds at most `cap` values.
 */
class Reservoir {
    private readonly cap: number;
    private readonly buf: number[] = [];
    private seen = 0;

    constructor(cap: number = RESERVOIR_CAPACITY) {
        this.cap = cap;
    }

    add(v: number): void {
        this.seen++;
        if (this.buf.length < this.cap) {
            this.buf.push(v);
            return;
        }
        // Replace an existing slot with probability cap/seen (Algorithm R).
        const j = Math.floor(Math.random() * this.seen);
        if (j < this.cap) this.buf[j] = v;
    }

    /** Sorted ascending copy of the retained sample. */
    sorted(): number[] {
        return [...this.buf].sort((a, b) => a - b);
    }
}

/**
 * Single-pass, bounded-memory accumulator for one column. `add()` is O(1)
 * amortised; `finalize()` reproduces `analyzeColumn`'s branching so the
 * resulting ColumnInfo is interchangeable with the in-memory path.
 *
 * Exactness: while distinct values stay at/under FREQUENCY_MAP_CAPACITY the
 * distinct count and per-value frequencies are exact. Past that, the distinct
 * count comes from KMV and the tracked frequencies cover the first K distinct
 * values. Quartiles are exact until numeric values exceed RESERVOIR_CAPACITY.
 */
export class ColumnSketch {
    private nonNull = 0;
    private numericCount = 0;
    private numSum = 0;
    private numMin = Infinity;
    private numMax = -Infinity;
    private readonly reservoir = new Reservoir();

    // Exact frequencies of (up to) the first FREQUENCY_MAP_CAPACITY distinct
    // values. `overflowed` flips once a further distinct value is seen.
    private readonly counts = new Map<string, number>();
    private overflowed = false;
    private kmv: KmvCardinality | null = null;

    private readonly samples: string[] = [];

    /** Feed one raw cell. Empty/null/undefined are treated as missing. */
    add(value: string | null | undefined): void {
        if (value === null || value === undefined || value === '') return;
        this.nonNull++;

        const num = parseFloat(value);
        if (!Number.isNaN(num)) {
            this.numericCount++;
            this.numSum += num;
            if (num < this.numMin) this.numMin = num;
            if (num > this.numMax) this.numMax = num;
            this.reservoir.add(num);
        }

        if (!this.overflowed) {
            const c = this.counts.get(value);
            if (c !== undefined) {
                this.counts.set(value, c + 1);
            } else if (this.counts.size < FREQUENCY_MAP_CAPACITY) {
                this.counts.set(value, 1);
            } else {
                // First distinct value beyond the cap: switch to estimate mode.
                this.overflowed = true;
                this.kmv = new KmvCardinality();
                for (const key of this.counts.keys()) this.kmv.add(key);
                this.kmv.add(value);
            }
        } else {
            this.kmv!.add(value);
            // Keep counting values we already track so heavy hitters stay accurate.
            const c = this.counts.get(value);
            if (c !== undefined) this.counts.set(value, c + 1);
        }

        if (this.samples.length < TEXT_SAMPLES) this.samples.push(value);
    }

    finalize(totalCount: number): ColumnInfo {
        const nullCount = totalCount - this.nonNull;

        if (this.nonNull === 0) {
            return { type: 'empty', stats: {}, nullCount, totalCount };
        }

        const isNumericBase = this.numericCount / this.nonNull > NUMERIC_BASE_RATIO;
        const distinct = this.distinctCount();
        const uniqueRatio = distinct / this.nonNull;

        if (uniqueRatio < CATEGORICAL_UNIQUE_RATIO || distinct < CATEGORICAL_MAX_DISTINCT) {
            const top = this.topValues();
            const stats: CategoricalStats = {
                count: this.nonNull,
                uniqueCount: distinct,
                values: top.map((t) => t.value),
                valueCounts: top.map((t) => t.count),
                hasMore: distinct > TOP_VALUES,
            };
            // Number-backed categoricals keep a min/max/median/mode summary. The
            // frequency map is exact for these low-cardinality columns (well
            // under FREQUENCY_MAP_CAPACITY), so the summary is exact too.
            if (isNumericBase) {
                const summary = numericCategoricalSummary(this.counts);
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
            const sorted = this.reservoir.sorted();
            const n = sorted.length;
            // Mode from the frequency map (exact up to FREQUENCY_MAP_CAPACITY,
            // approximate after — best available with bounded memory).
            let modeValue = this.numMin;
            let modeFreq = -1;
            for (const [raw, freq] of this.counts) {
                const num = parseFloat(raw);
                if (!Number.isNaN(num) && freq > modeFreq) {
                    modeFreq = freq;
                    modeValue = num;
                }
            }
            const stats: NumericStats = {
                count: this.numericCount,
                min: this.numMin,
                max: this.numMax,
                mean: this.numSum / this.numericCount,
                q1: sorted[Math.floor(n * 0.25)],
                median: sorted[Math.floor(n * 0.5)],
                q3: sorted[Math.floor(n * 0.75)],
                mode: modeValue,
            };
            return { type: 'numeric', stats, nullCount, totalCount };
        }

        const stats: TextStats = {
            count: this.nonNull,
            uniqueCount: distinct,
            samples: this.samples.slice(0, TEXT_SAMPLES),
        };
        return { type: 'text', stats, nullCount, totalCount };
    }

    /** Distinct-value count: exact when under the cap, else the KMV estimate. */
    private distinctCount(): number {
        return this.overflowed && this.kmv ? this.kmv.estimate() : this.counts.size;
    }

    private topValues(): { value: string; count: number }[] {
        return [...this.counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, TOP_VALUES)
            .map(([value, count]) => ({ value, count }));
    }
}
