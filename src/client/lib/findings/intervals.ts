/**
 * Pure time-series primitives shared by every detector: estimating the sample
 * interval and finding "breach runs" — maximal stretches where a metric stays
 * past a threshold. No SAR/store knowledge lives here, so it is exhaustively
 * unit-testable with synthetic series.
 */
// LegacyPoint (`[timestamp, value]`) is an ambient global from types/legacy.d.ts.

/** A `[timestamp, value]` sample with a non-null, finite value. */
type CleanPoint = { ts: number; value: number };

/** A maximal stretch of samples that stayed past a threshold. */
export type BreachRun = {
  /** Epoch ms of the first and last breaching sample. */
  start: number;
  end: number;
  /** Largest value seen in the run, and when. */
  peak: number;
  peakTs: number;
  /** Mean of the breaching values. */
  mean: number;
  /** Number of samples in the run. */
  count: number;
  /**
   * Covered duration in ms: (end - start) + one sample interval, so a single
   * breaching sample counts as ~one interval of activity rather than 0 ms.
   */
  durationMs: number;
};

/** Drop null/NaN values and sort by time; the getters mostly sort already. */
function clean(points: LegacyPoint[]): CleanPoint[] {
  const out: CleanPoint[] = [];
  for (const [ts, value] of points) {
    if (value == null || !Number.isFinite(value) || !Number.isFinite(ts)) continue;
    out.push({ ts, value });
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

/**
 * Median gap between consecutive samples, in ms. The median (not mean) shrugs
 * off the large gaps that appear across a `sar` restart or a date boundary.
 * Returns 0 for fewer than two samples.
 */
export function estimateSampleIntervalMs(points: LegacyPoint[]): number {
  const pts = clean(points);
  if (pts.length < 2) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < pts.length; i += 1) gaps.push(pts[i].ts - pts[i - 1].ts);
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
}

/**
 * Find runs where `isBreach(value)` holds. Consecutive breaching samples form a
 * run; two runs separated by a gap no larger than `maxGapMs` are merged, so one
 * dipped sample (or a missing reading) doesn't fragment a genuinely sustained
 * event. `sampleIntervalMs` (defaulting to the series' own estimate) seeds both
 * the merge tolerance and the single-sample duration.
 */
export function findBreachRuns(
  points: LegacyPoint[],
  isBreach: (value: number) => boolean,
  options: { sampleIntervalMs?: number; maxGapMs?: number } = {}
): BreachRun[] {
  const pts = clean(points);
  if (!pts.length) return [];

  const interval = options.sampleIntervalMs ?? estimateSampleIntervalMs(points);
  // Bridge a single dipped/missing sample: two breaches straddling one
  // below-threshold sample sit ~2 intervals apart. 2.5× bridges that one gap
  // (and timestamp jitter) but still splits on two-or-more consecutive
  // non-breaching samples, which is a genuine recovery, not noise.
  const maxGap = options.maxGapMs ?? interval * 2.5;

  const runs: BreachRun[] = [];
  let current: CleanPoint[] = [];
  let lastBreachTs = -Infinity;

  const flush = () => {
    if (!current.length) return;
    let peak = -Infinity;
    let peakTs = current[0].ts;
    let sum = 0;
    for (const p of current) {
      sum += p.value;
      if (p.value > peak) { peak = p.value; peakTs = p.ts; }
    }
    const start = current[0].ts;
    const end = current[current.length - 1].ts;
    runs.push({
      start,
      end,
      peak,
      peakTs,
      mean: sum / current.length,
      count: current.length,
      durationMs: (end - start) + interval
    });
    current = [];
  };

  for (const p of pts) {
    if (!isBreach(p.value)) continue;
    if (current.length && p.ts - lastBreachTs > maxGap) flush();
    current.push(p);
    lastBreachTs = p.ts;
  }
  flush();
  return runs;
}

/** Mean of a series over a time window (inclusive), ignoring null/NaN. */
export function meanInWindow(points: LegacyPoint[], start: number, end: number): number {
  let sum = 0;
  let n = 0;
  for (const [ts, value] of points) {
    if (ts < start || ts > end) continue;
    if (value == null || !Number.isFinite(value)) continue;
    sum += value;
    n += 1;
  }
  return n ? sum / n : 0;
}

/** Max of a series over a time window (inclusive), ignoring null/NaN. */
export function maxInWindow(points: LegacyPoint[], start: number, end: number): number {
  let peak = -Infinity;
  for (const [ts, value] of points) {
    if (ts < start || ts > end) continue;
    if (value == null || !Number.isFinite(value)) continue;
    if (value > peak) peak = value;
  }
  return peak === -Infinity ? 0 : peak;
}
