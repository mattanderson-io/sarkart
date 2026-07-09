/**
 * Per-subsystem detectors. Each turns raw SAR series into zero or more
 * `Finding`s using the documented thresholds and the shared breach-run
 * algorithm. Detectors set each finding's intrinsic `tier` and `severity`;
 * ordering and incident-window logic live in `rank.ts`.
 *
 * A detector reads only through `access.ts`, so it stays testable by seeding the
 * store. All findings are emitted in capture (file) time.
 */
// LegacyPoint (`[timestamp, value]`) is an ambient global from types/legacy.d.ts.
import { getDeviceSeries, getInterfaceErrorSeries } from '../sarData.ts';
import {
  coreCount,
  cpuAllSeries,
  formatClock,
  formatDuration,
  genericSeries,
  headerByFirstToken,
  headerByFirstTokenWithColumn
} from './access.ts';
import { findBreachRuns, meanInWindow, type BreachRun } from './intervals.ts';
import { headerSectionKey } from '../sarData.ts';
import {
  CPU_IOWAIT,
  CPU_STEAL,
  DISK,
  DURATION,
  LOAD_PER_CORE,
  MEMORY_COMMIT,
  NETWORK_ERRORS,
  SWAP_ACTIVITY
} from './thresholds.ts';
import type { ChartTarget, Finding, FindingTier, Subsystem } from './types.ts';

/** Clamp to [0, 1]. */
function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Tier from a run's duration and whether its magnitude cleared the "severe" bar.
 * Conservative: Strong needs BOTH a severe magnitude AND a severe duration;
 * anything merely sustained is Moderate; anything briefer is Weak.
 */
function classifyTier(run: BreachRun, severeMagnitude: boolean): FindingTier {
  if (severeMagnitude && run.durationMs >= DURATION.severeMs) return 'strong';
  if (run.durationMs >= DURATION.sustainedMs) return 'moderate';
  return 'weak';
}

/**
 * Normalized 0..1 signal strength for intra-tier ordering: 60% magnitude
 * (how far past the breach line, saturating at the severe line) and 40%
 * duration (saturating at the severe duration).
 */
function severityScore(peak: number, breach: number, severe: number, durationMs: number): number {
  const span = severe - breach;
  const magNorm = span > 0 ? clamp01((peak - breach) / span) : 1;
  const durNorm = clamp01(durationMs / DURATION.severeMs);
  return clamp01(0.6 * magNorm + 0.4 * durNorm);
}

/** Combine several index-aligned series into one via a per-sample reducer. */
function combineByIndex(series: LegacyPoint[][], reduce: (vals: number[]) => number): LegacyPoint[] {
  const first = series.find((s) => s.length) || [];
  const out: LegacyPoint[] = [];
  for (let i = 0; i < first.length; i += 1) {
    const ts = first[i][0];
    const vals: number[] = [];
    for (const s of series) {
      const v = s[i]?.[1];
      vals.push(v == null || !Number.isFinite(v) ? 0 : v);
    }
    out.push([ts, reduce(vals)]);
  }
  return out;
}

type FindingSeed = {
  subsystem: Subsystem;
  resourceId?: string;
  metric: string;
  unit: string;
  title: string;
  rule: string;
  detail: string;
  tier: FindingTier;
  severity: number;
  chartTarget: ChartTarget;
  run: BreachRun;
};

function toFinding(seed: FindingSeed): Finding {
  return {
    id: `${seed.subsystem}:${seed.metric}${seed.resourceId ? `:${seed.resourceId}` : ''}:${seed.run.start}`,
    subsystem: seed.subsystem,
    title: seed.title,
    rule: seed.rule,
    detail: seed.detail,
    start: seed.run.start,
    end: seed.run.end,
    peakValue: seed.run.peak,
    unit: seed.unit,
    metric: seed.metric,
    tier: seed.tier,
    severity: seed.severity,
    chartTarget: seed.chartTarget
  };
}

/** Shared "sustained %-threshold on a single series" detector. */
function detectPctBreach(config: {
  series: LegacyPoint[];
  subsystem: Subsystem;
  metric: string;
  breachPct: number;
  severePct: number;
  chartTarget: ChartTarget;
  title: (run: BreachRun) => string;
  rule: (run: BreachRun) => string;
  detail: (run: BreachRun) => string;
}): Finding[] {
  const runs = findBreachRuns(config.series, (v) => v > config.breachPct);
  return runs.map((run) => toFinding({
    subsystem: config.subsystem,
    metric: config.metric,
    unit: '%',
    title: config.title(run),
    rule: config.rule(run),
    detail: config.detail(run),
    tier: classifyTier(run, run.peak >= config.severePct),
    severity: severityScore(run.peak, config.breachPct, config.severePct, run.durationMs),
    chartTarget: config.chartTarget,
    run
  }));
}

// -- CPU --------------------------------------------------------------------

export function detectCpuIowait(): Finding[] {
  return detectPctBreach({
    series: cpuAllSeries('%iowait'),
    subsystem: 'cpu',
    metric: '%iowait',
    breachPct: CPU_IOWAIT.breachPct,
    severePct: CPU_IOWAIT.severePct,
    chartTarget: { kind: 'cpu', coreId: 'all' },
    title: () => 'CPU stalled waiting on storage (I/O wait)',
    rule: (run) => `%iowait above ${CPU_IOWAIT.breachPct}% for ${formatDuration(run.durationMs)}`,
    detail: (run) =>
      `CPU idle-waiting on disk peaked at ${run.peak.toFixed(0)}% (avg ${run.mean.toFixed(0)}%) `
      + `from ${formatClock(run.start)} to ${formatClock(run.end)}. High iowait points at slow storage, not a CPU shortage.`
  });
}

export function detectCpuSteal(): Finding[] {
  return detectPctBreach({
    series: cpuAllSeries('%steal'),
    subsystem: 'cpu',
    metric: '%steal',
    breachPct: CPU_STEAL.breachPct,
    severePct: CPU_STEAL.severePct,
    chartTarget: { kind: 'cpu', coreId: 'all' },
    title: () => 'CPU time stolen by the hypervisor',
    rule: (run) => `%steal above ${CPU_STEAL.breachPct}% for ${formatDuration(run.durationMs)}`,
    detail: (run) =>
      `CPU steal peaked at ${run.peak.toFixed(0)}% (avg ${run.mean.toFixed(0)}%) `
      + `from ${formatClock(run.start)} to ${formatClock(run.end)}. This VM was ready to run but the host gave the physical CPU elsewhere.`
  });
}

// -- Load -------------------------------------------------------------------

export function detectLoad(): Finding[] {
  const section = genericSeries('runq-sz', 'ldavg-5');
  if (!section) return [];
  const cores = coreCount();
  const breach = LOAD_PER_CORE.breach * cores;
  const severe = LOAD_PER_CORE.severe * cores;

  const runs = findBreachRuns(section.points, (v) => v > breach);
  return runs.map((run) => {
    const peakPerCore = run.peak / cores;
    return toFinding({
      subsystem: 'load',
      metric: 'ldavg-5',
      unit: '',
      title: 'Run queue backing up (high load average)',
      rule: `5-min load average above ${LOAD_PER_CORE.breach}× the ${cores} cores for ${formatDuration(run.durationMs)}`,
      detail:
        `Load average peaked at ${run.peak.toFixed(1)} (${peakPerCore.toFixed(1)} per core across ${cores} cores) `
        + `from ${formatClock(run.start)} to ${formatClock(run.end)}. More tasks were ready to run than the CPUs could serve.`,
      tier: classifyTier(run, run.peak >= severe),
      severity: severityScore(run.peak, breach, severe, run.durationMs),
      chartTarget: { kind: 'sidebar', buttonId: 'btnLoad' },
      run
    });
  });
}

// -- Memory pressure (swapping, corroborated by commit) ---------------------

export function detectMemoryPressure(): Finding[] {
  const swapping = genericSeries('pswpin/s', 'pswpin/s');
  const swapOut = genericSeries('pswpin/s', 'pswpout/s');
  if (!swapping) return [];

  // Total swap page traffic per sample (in + out) is the concrete evidence that
  // RAM is under real pressure.
  const activity = combineByIndex(
    [swapping.points, swapOut?.points || []],
    (vals) => vals.reduce((a, b) => a + b, 0)
  );

  const commit = genericSeries('kbmemfree', '%commit');
  const runs = findBreachRuns(activity, (v) => v > SWAP_ACTIVITY.breachPps);

  return runs.map((run) => {
    const commitPeak = commit ? Math.max(0, meanInWindow(commit.points, run.start, run.end)) : 0;
    const commitNote = commit
      ? ` Committed memory averaged ${commitPeak.toFixed(0)}% of RAM+swap over the same window.`
      : '';
    return toFinding({
      subsystem: 'memory',
      metric: 'swap',
      unit: ' pages/s',
      title: 'Memory pressure — system is swapping',
      rule: `Swap page traffic above ${SWAP_ACTIVITY.breachPps}/s for ${formatDuration(run.durationMs)}`,
      detail:
        `Swap activity peaked at ${run.peak.toFixed(0)} pages/s (avg ${run.mean.toFixed(0)}) `
        + `from ${formatClock(run.start)} to ${formatClock(run.end)}.` + commitNote
        + ' Sustained swapping means the working set no longer fits in RAM.',
      tier: classifyTier(run, run.peak >= SWAP_ACTIVITY.severePps || commitPeak >= MEMORY_COMMIT.severePct),
      severity: severityScore(run.peak, SWAP_ACTIVITY.breachPps, SWAP_ACTIVITY.severePps, run.durationMs),
      chartTarget: { kind: 'sidebar', buttonId: 'btnSwap' },
      run
    });
  });
}

// -- Disk saturation (per device) -------------------------------------------

export function detectDisk(): Finding[] {
  const header = headerByFirstToken('DEV');
  if (!header) return [];
  const series = getDeviceSeries(headerSectionKey(header));
  const findings: Finding[] = [];

  series.ids.forEach((deviceId, i) => {
    const util = series.utilPercent[i] || [];
    const awaitSeries = series.await[i] || [];
    const runs = findBreachRuns(util, (v) => v > DISK.utilBreachPct);

    for (const run of runs) {
      const awaitMean = meanInWindow(awaitSeries, run.start, run.end);
      // %util near 100% only means saturation if latency is also climbing —
      // an SSD/array can sit at high %util while serving requests fast.
      if (awaitMean < DISK.awaitElevatedMs) continue;

      const severe = run.peak >= DISK.utilSeverePct && awaitMean >= DISK.awaitSevereMs;
      findings.push(toFinding({
        subsystem: 'disk',
        resourceId: deviceId,
        metric: '%util',
        unit: '%',
        title: `Disk I/O saturation on ${deviceId}`,
        rule: `${deviceId} %util above ${DISK.utilBreachPct}% with await ${awaitMean.toFixed(0)} ms for ${formatDuration(run.durationMs)}`,
        detail:
          `Device ${deviceId} was ${run.peak.toFixed(0)}% busy with average request latency of ${awaitMean.toFixed(0)} ms `
          + `from ${formatClock(run.start)} to ${formatClock(run.end)}. The disk could not keep up with the I/O demand.`,
        tier: classifyTier(run, severe),
        severity: severityScore(run.peak, DISK.utilBreachPct, DISK.utilSeverePct, run.durationMs),
        chartTarget: { kind: 'device', deviceId },
        run
      }));
    }
  });

  return findings;
}

// -- Network errors (per interface) -----------------------------------------

export function detectNetwork(): Finding[] {
  const header = headerByFirstTokenWithColumn('IFACE', 'rxerr/s');
  if (!header) return [];
  const series = getInterfaceErrorSeries(headerSectionKey(header));
  const findings: Finding[] = [];

  series.ids.forEach((ifaceId, i) => {
    // Errors + drops + collisions across both directions, per sample.
    const combined = combineByIndex(
      [
        series.rxerr[i] || [], series.txerr[i] || [], series.coll[i] || [],
        series.rxdrop[i] || [], series.txdrop[i] || []
      ],
      (vals) => vals.reduce((a, b) => a + b, 0)
    );
    const runs = findBreachRuns(combined, (v) => v > NETWORK_ERRORS.breachPerSec);

    for (const run of runs) {
      findings.push(toFinding({
        subsystem: 'network',
        resourceId: ifaceId,
        metric: 'errors',
        unit: '/s',
        title: `Network errors on ${ifaceId}`,
        rule: `${ifaceId} error/drop rate above ${NETWORK_ERRORS.breachPerSec}/s for ${formatDuration(run.durationMs)}`,
        detail:
          `Interface ${ifaceId} saw errors/drops peak at ${run.peak.toFixed(1)}/s (avg ${run.mean.toFixed(1)}) `
          + `from ${formatClock(run.start)} to ${formatClock(run.end)}. On a healthy switched network these stay at zero.`,
        tier: classifyTier(run, run.peak >= NETWORK_ERRORS.severePerSec),
        severity: severityScore(run.peak, NETWORK_ERRORS.breachPerSec, NETWORK_ERRORS.severePerSec, run.durationMs),
        chartTarget: { kind: 'interfaceError', interfaceId: ifaceId },
        run
      }));
    }
  });

  return findings;
}

/** Every detector, in a stable order. The orchestrator runs them all. */
export const ALL_DETECTORS: Array<() => Finding[]> = [
  detectCpuIowait,
  detectCpuSteal,
  detectLoad,
  detectMemoryPressure,
  detectDisk,
  detectNetwork
];
