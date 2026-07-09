/**
 * Unit + regression coverage for the diagnostic differential engine
 * (`src/client/lib/findings/`). Three layers:
 *   1. Pure interval primitives (`intervals.ts`) with synthetic series.
 *   2. Each detector, seeded with hand-built store rows that trip exactly one
 *      rule, asserting subsystem/tier/time-range.
 *   3. Ranking + window logic, and a healthy-file regression: the bundled
 *      sample SAR file must NOT produce any Strong/Moderate finding (guarding
 *      against false alarms — the design's biggest trust risk).
 *
 * Runs on Node's built-in runner with TypeScript type-stripping (`npm test`).
 * Detectors read the store, so each test seeds it via `setSarData`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Window/CustomEvent shim: the data layer touches window.* at call time only.
const win: Record<string, unknown> = { dispatchEvent: () => true };
(globalThis as unknown as { window: unknown }).window = win;
(globalThis as unknown as { CustomEvent: unknown }).CustomEvent = class {
  type: string;
  detail: unknown;
  constructor(type: string, init?: { detail?: unknown }) {
    this.type = type;
    this.detail = init?.detail;
  }
};

const { estimateSampleIntervalMs, findBreachRuns } = await import('../src/client/lib/findings/intervals.ts');
const { rankFindings, overlapsWindow, distanceToWindow } = await import('../src/client/lib/findings/rank.ts');
const {
  detectCpuIowait, detectCpuSteal, detectLoad, detectMemoryPressure, detectDisk, detectNetwork
} = await import('../src/client/lib/findings/detectors.ts');
const { computeCoverage } = await import('../src/client/lib/findings/coverage.ts');
const { ensureCpuIndex } = await import('../src/client/lib/findings/access.ts');
const { buildTicketSummary } = await import('../src/client/lib/findings/ticket.ts');
const { findingDayString } = await import('../src/client/lib/findings/findingNav.ts');
const { computeFindings } = await import('../src/client/lib/findings/index.ts');
const { parseSarTextChunked } = await import('../src/client/lib/sarParser.ts');
const { setSarData } = await import('../src/client/lib/sarStore.ts');

type Row = [number, number | null | undefined];

const MIN = 60_000;
const T0 = Date.UTC(2026, 3, 1, 13, 0, 0); // 04/01/26 13:00 UTC

/** Build a `[ts, value]` series at `stepMin`-minute spacing starting at T0. */
function series(values: number[], stepMin = 10): Row[] {
  return values.map((v, i) => [T0 + i * stepMin * MIN, v] as Row);
}

/** Seed the store with a section index + headers + firstLine. */
function store(index: Record<string, string[]>, headers: string[], firstLine = 'Linux,(4 CPU)') {
  setSarData({ firstLine, headers, index, fullIndex: index, dates: [] });
}

/** "HH:MM:SS" for a T0-relative sample. */
function clock(stepMin: number): string {
  const d = new Date(T0 + stepMin * MIN);
  const p = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

// -- intervals.ts -----------------------------------------------------------

test('estimateSampleIntervalMs: median gap ignores restart gaps', () => {
  const pts = series([1, 2, 3, 4]); // 10-min spacing
  assert.equal(estimateSampleIntervalMs(pts), 10 * MIN);
  // Insert a large gap; the median is unaffected.
  const withGap: Row[] = [...pts, [T0 + 500 * MIN, 5]];
  assert.equal(estimateSampleIntervalMs(withGap), 10 * MIN);
});

test('findBreachRuns: single breaching sample gets one interval of duration', () => {
  const pts = series([0, 30, 0]); // one breach at index 1
  const runs = findBreachRuns(pts, (v) => v > 20);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].count, 1);
  assert.equal(runs[0].peak, 30);
  assert.equal(runs[0].durationMs, 10 * MIN, 'single sample ≈ one sample interval');
});

test('findBreachRuns: consecutive breaches merge into one sustained run', () => {
  const pts = series([0, 50, 50, 50, 0]); // 3 breaches, span 20 min
  const runs = findBreachRuns(pts, (v) => v > 20);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].count, 3);
  assert.equal(runs[0].durationMs, 30 * MIN, '20 min span + 10 min interval');
});

test('findBreachRuns: one dipped sample does not fragment a run', () => {
  const pts = series([50, 10, 50]); // dip at index 1, gap within 1.5× interval
  const runs = findBreachRuns(pts, (v) => v > 20);
  assert.equal(runs.length, 1, 'the single below-threshold sample is bridged');
  assert.equal(runs[0].count, 2);
});

test('findBreachRuns: a wide gap between breaches splits into two runs', () => {
  const pts: Row[] = [[T0, 50], [T0 + 100 * MIN, 50]];
  const runs = findBreachRuns(pts, (v) => v > 20, { sampleIntervalMs: 10 * MIN });
  assert.equal(runs.length, 2, 'a 100-min gap exceeds the merge tolerance');
});

// -- detectors --------------------------------------------------------------

const CPU_HEADER = 'CPU,%usr,%nice,%sys,%iowait,%steal,%irq,%soft,%guest,%gnice,%idle';

/** CPU "all" rows: parts = key, dt, all, usr, nice, sys, iowait, steal, ... */
function cpuRows(spec: Array<{ step: number; iowait: number; steal: number }>): string[] {
  return spec.map(({ step, iowait, steal }) =>
    `CPU-%usr,04/01/26|${clock(step)},all,5,0,2,${iowait},${steal},0,0,0,0,80`
  );
}

/** Seed CPU rows and build the per-core index the CPU detectors read. */
async function storeCpu(spec: Array<{ step: number; iowait: number; steal: number }>) {
  store({ 'CPU-%usr': cpuRows(spec) }, [CPU_HEADER]);
  await ensureCpuIndex();
}

test('detectCpuIowait: sustained severe iowait → Strong, correct window', async () => {
  // 4 samples ≥40% over 30 min span (40 min duration) → severe + severe duration.
  await storeCpu([0, 1, 2, 3].map((step) => ({ step: step * 10, iowait: 55, steal: 0 })));
  const findings = detectCpuIowait();
  assert.equal(findings.length, 1);
  assert.equal(findings[0].subsystem, 'cpu');
  assert.equal(findings[0].metric, '%iowait');
  assert.equal(findings[0].tier, 'strong');
  assert.equal(findings[0].peakValue, 55);
  assert.equal(findings[0].start, T0);
  assert.equal(findings[0].end, T0 + 30 * MIN);
  assert.deepEqual(findings[0].chartTarget, { kind: 'cpu', coreId: 'all' });
});

test('detectCpuIowait: a brief single-sample spike → Weak', async () => {
  await storeCpu([{ step: 0, iowait: 5, steal: 0 }, { step: 10, iowait: 55, steal: 0 }, { step: 20, iowait: 5, steal: 0 }]);
  const findings = detectCpuIowait();
  assert.equal(findings.length, 1);
  assert.equal(findings[0].tier, 'weak', 'one 10-min breach is below the sustained bar');
});

test('detectCpuIowait: healthy iowait → no findings', async () => {
  await storeCpu([0, 1, 2, 3].map((s) => ({ step: s * 10, iowait: 2, steal: 0 })));
  assert.equal(detectCpuIowait().length, 0);
});

test('detectCpuSteal: sustained steal above 5% → Moderate', async () => {
  // 3 samples at 8% steal (20 min span, 30 min duration) but below severe 15% → moderate.
  await storeCpu([0, 1, 2].map((s) => ({ step: s * 10, iowait: 0, steal: 8 })));
  const findings = detectCpuSteal();
  assert.equal(findings.length, 1);
  assert.equal(findings[0].subsystem, 'cpu');
  assert.equal(findings[0].tier, 'moderate');
});

test('detectLoad: load average above 1.5× cores → finding, uses core count', () => {
  // 4 cores → breach at 6.0. ldavg-5 at parts[5].
  const rows = [0, 1, 2].map((s) =>
    `runq-sz-plist-sz,04/01/26|${clock(s * 10)},2,10,7,9,9,0` // ldavg-5 = 9
  );
  store({ 'runq-sz-plist-sz': rows }, ['runq-sz,plist-sz,ldavg-1,ldavg-5,ldavg-15,blocked'], 'Linux,(4 CPU)');
  const findings = detectLoad();
  assert.equal(findings.length, 1);
  assert.equal(findings[0].subsystem, 'load');
  assert.equal(findings[0].peakValue, 9);
  assert.ok(findings[0].rule.includes('4 cores'));
});

test('detectLoad: same load with more cores is not a finding', () => {
  const rows = [0, 1, 2].map((s) => `runq-sz-plist-sz,04/01/26|${clock(s * 10)},2,10,7,9,9,0`);
  store({ 'runq-sz-plist-sz': rows }, ['runq-sz,plist-sz,ldavg-1,ldavg-5,ldavg-15,blocked'], 'Linux,(64 CPU)');
  assert.equal(detectLoad().length, 0, 'load 9 across 64 cores is fine');
});

test('detectMemoryPressure: sustained swapping → finding with commit note', () => {
  // pswpin/pswpout section; sustained swap-in.
  const rows = [0, 1, 2].map((s) => `pswpin/s-pswpout/s,04/01/26|${clock(s * 10)},80,10`);
  const commitRows = [0, 1, 2].map((s) => `kbmemfree-kbavail,04/01/26|${clock(s * 10)},100,200,0,0,160`);
  store(
    { 'pswpin/s-pswpout/s': rows, 'kbmemfree-kbavail': commitRows },
    ['pswpin/s,pswpout/s', 'kbmemfree,kbavail,kbmemused,%memused,%commit']
  );
  const findings = detectMemoryPressure();
  assert.equal(findings.length, 1);
  assert.equal(findings[0].subsystem, 'memory');
  assert.equal(findings[0].peakValue, 90, 'swap in+out = 80+10');
  assert.ok(findings[0].detail.includes('Committed memory'), 'commit corroboration in detail');
  assert.deepEqual(findings[0].chartTarget, { kind: 'sidebar', buttonId: 'btnSwap' });
});

test('detectDisk: high %util with elevated await → finding on the device', () => {
  // DEV header; device sdb at %util 96, await 120 ms sustained.
  const rows = [0, 1, 2].map((s) =>
    `DEV-tps,04/01/26|${clock(s * 10)},sdb,500,100,100,200,64,2.0,120,96`
  );
  store({ 'DEV-tps': rows }, ['DEV,tps,rkB/s,wkB/s,dkB/s,areq-sz,aqu-sz,await,%util']);
  const findings = detectDisk();
  assert.equal(findings.length, 1);
  assert.equal(findings[0].subsystem, 'disk');
  assert.equal(findings[0].title, 'Disk I/O saturation on sdb');
  assert.deepEqual(findings[0].chartTarget, { kind: 'device', deviceId: 'sdb' });
});

test('detectDisk: high %util but LOW await is not flagged (SSD/array)', () => {
  const rows = [0, 1, 2].map((s) =>
    `DEV-tps,04/01/26|${clock(s * 10)},nvme0n1,9000,100,100,200,64,0.5,2,99`
  );
  store({ 'DEV-tps': rows }, ['DEV,tps,rkB/s,wkB/s,dkB/s,areq-sz,aqu-sz,await,%util']);
  assert.equal(detectDisk().length, 0, '99% util at 2 ms await is a fast device, not saturation');
});

test('detectNetwork: sustained errors on an interface → finding', () => {
  // IFACE errors header; eth0 with rxerr 5/s sustained.
  const rows = [0, 1, 2].map((s) =>
    `IFACE-rxerr/s,04/01/26|${clock(s * 10)},eth0,5,0,0,0,0,0,0,0,0`
  );
  store({ 'IFACE-rxerr/s': rows }, ['IFACE,rxerr/s,txerr/s,coll/s,rxdrop/s,txdrop/s,txcarr/s,rxfram/s,rxfifo/s,txfifo/s']);
  const findings = detectNetwork();
  assert.equal(findings.length, 1);
  assert.equal(findings[0].subsystem, 'network');
  assert.deepEqual(findings[0].chartTarget, { kind: 'interfaceError', interfaceId: 'eth0' });
});

// -- ranking ----------------------------------------------------------------

function fakeFinding(over: Partial<Record<string, unknown>>) {
  return {
    id: 'x', subsystem: 'cpu', title: 't', rule: 'r', detail: 'd',
    start: T0, end: T0 + 10 * MIN, peakValue: 1, unit: '%', metric: 'm',
    tier: 'moderate', severity: 0.5, chartTarget: { kind: 'cpu', coreId: 'all' },
    ...over
  } as Parameters<typeof rankFindings>[0][number];
}

test('rankFindings: no window → strong before moderate before weak', () => {
  const out = rankFindings([
    fakeFinding({ id: 'w', tier: 'weak' }),
    fakeFinding({ id: 's', tier: 'strong' }),
    fakeFinding({ id: 'm', tier: 'moderate' })
  ]);
  assert.deepEqual(out.map((f) => f.id), ['s', 'm', 'w']);
});

test('rankFindings: window demotes out-of-window findings even if stronger', () => {
  const window = { start: T0 + 100 * MIN, end: T0 + 110 * MIN };
  const inWindow = fakeFinding({ id: 'in', tier: 'weak', start: T0 + 100 * MIN, end: T0 + 105 * MIN });
  const outStrong = fakeFinding({ id: 'out', tier: 'strong', start: T0, end: T0 + 10 * MIN });
  const out = rankFindings([outStrong, inWindow], window);
  assert.deepEqual(out.map((f) => f.id), ['in', 'out'], 'in-window weak beats out-of-window strong');
});

test('rankFindings: out-of-window findings ordered by proximity', () => {
  const window = { start: T0 + 200 * MIN, end: T0 + 210 * MIN };
  const near = fakeFinding({ id: 'near', tier: 'weak', start: T0 + 180 * MIN, end: T0 + 190 * MIN });
  const far = fakeFinding({ id: 'far', tier: 'strong', start: T0, end: T0 + 10 * MIN });
  const out = rankFindings([far, near], window);
  assert.deepEqual(out.map((f) => f.id), ['near', 'far'], 'closer miss first, despite weaker tier');
});

test('overlaps/distance helpers', () => {
  const window = { start: T0 + 100 * MIN, end: T0 + 110 * MIN };
  assert.equal(overlapsWindow(fakeFinding({ start: T0 + 105 * MIN, end: T0 + 106 * MIN }), window), true);
  assert.equal(distanceToWindow(fakeFinding({ start: T0, end: T0 + 10 * MIN }), window), 90 * MIN);
});

// -- coverage + healthy-file regression -------------------------------------

test('computeCoverage: reports present and missing subsystems', async () => {
  await storeCpu([{ step: 0, iowait: 1, steal: 0 }]);
  const cov = computeCoverage();
  assert.ok(cov.present.includes('cpu'));
  assert.ok(cov.missing.includes('disk'), 'no DEV section → disk unchecked');
  assert.ok(cov.missing.includes('network'));
});

// -- ticket prose -----------------------------------------------------------

function sampleFinding(over: Record<string, unknown> = {}) {
  return {
    id: 'x', subsystem: 'disk', title: 'Disk I/O saturation on sdb', rule: '%util above 90% with await 120 ms for 32 min',
    detail: 'd', start: T0, end: T0 + 32 * MIN, peakValue: 96, unit: '%', metric: '%util',
    tier: 'strong', severity: 0.8, chartTarget: { kind: 'device', deviceId: 'sdb' },
    ...over
  } as Parameters<typeof buildTicketSummary>[0][number];
}

test('buildTicketSummary: empty findings → exoneration with checked/missing subsystems', () => {
  const text = buildTicketSummary([], { present: ['cpu', 'load', 'memory'], missing: ['disk', 'network'], sampleCount: 144 }, { hostname: 'db01', os: 'LINUX' });
  assert.ok(text.includes('no resource bottleneck signals'), 'states absence of signal');
  assert.ok(text.includes('db01'));
  assert.ok(text.includes('144 samples'));
  assert.ok(text.includes('disk and network'), 'names the unchecked subsystems');
  assert.ok(text.includes('do not appear to explain'));
});

test('buildTicketSummary: findings → primary finding plus grouped supporting signals', () => {
  const text = buildTicketSummary(
    [sampleFinding(), sampleFinding({ id: 'y', tier: 'moderate', subsystem: 'memory', title: 'Memory pressure — system is swapping' })],
    { present: ['cpu', 'disk', 'memory'], missing: [], sampleCount: 100 },
    { hostname: 'db01', os: 'LINUX' }
  );
  assert.ok(text.includes('2 signals'));
  assert.ok(text.includes('The strongest evidence points to disk I/O saturation on sdb'));
  assert.ok(text.includes('Supporting signals:'));
  assert.ok(!text.includes('Also observed'));
});

// -- deep-dive day matching -------------------------------------------------

test('findingDayString: matches a finding start to its capture date string', () => {
  // Seed a multi-day date list; the store's getDates() is what nav matches against.
  setSarData({ firstLine: 'Linux,(4 CPU)', headers: [], index: {}, fullIndex: {}, dates: ['04/01/26', '04/02/26', '04/03/26'] });

  // 04/02/26 13:00 UTC.
  const ts = Date.UTC(2026, 3, 2, 13, 0, 0);
  assert.equal(findingDayString(ts), '04/02/26');

  // A day not present in the capture returns null.
  assert.equal(findingDayString(Date.UTC(2025, 0, 1, 0, 0, 0)), null);
});

test('healthy sample SAR file produces no Strong or Moderate findings', async () => {
  const fixture = path.join(import.meta.dirname, '..', 'public', 'sample', 'sample-sar.txt');
  const parsed = await parseSarTextChunked(readFileSync(fixture, 'utf8'));
  setSarData(parsed);

  const { findings, coverage } = await computeFindings();
  const alarming = findings.filter((f) => f.tier === 'strong' || f.tier === 'moderate');
  assert.deepEqual(
    alarming.map((f) => `${f.tier} ${f.title}`),
    [],
    'a known-healthy capture must not raise Strong/Moderate findings (false-alarm guard)'
  );
  assert.ok(coverage.sampleCount > 0, 'coverage reports a sample count');
  assert.ok(coverage.present.includes('cpu'));
});
