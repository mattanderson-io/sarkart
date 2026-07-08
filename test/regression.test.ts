/**
 * Fixture-based regression coverage for the SARkart data layer (Chunk 3 of the
 * Preact migration). Parses the bundled sample SAR file through the real
 * `parseSarTextChunked` and asserts on the parsed structure plus the pure
 * `sarData` helpers and the `sarStore` date filter — locking in the numbers the
 * dashboard renders (peak CPU 15, load 44, memory 5; 65 CPU cores; 11 devices;
 * 11 interfaces) so future refactors can't silently change them.
 *
 * Runs on Node's built-in test runner with native TypeScript type-stripping
 * (no extra dependencies): `npm test`. Lives outside `src/client` so it is not
 * part of the Vite build or the app's `tsc` typecheck.
 *
 * sarStore's sole import is `import type`, which type-stripping erases, so it
 * loads without a bundler. The modules touch `window` only at call time, so a
 * tiny global shim is enough — no jsdom required.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Minimal window/CustomEvent shim: the data layer reads window.* at call time
// and setSarData dispatches a CustomEvent. No DOM is required for these tests.
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

const { parseSarTextChunked } = await import('../src/client/lib/sarParser.ts');
const { uniqueIds, getGenericData, getDeviceSeries, getInterfaceTrafficSeries, grepHeader } = await import(
  '../src/client/lib/sarData.ts'
);
const { setSarData, filterSarDataByDates } = await import('../src/client/lib/sarStore.ts');

type Parsed = Awaited<ReturnType<typeof parseSarTextChunked>>;

const fixturePath = path.join(import.meta.dirname, '..', 'public', 'sample', 'sample-sar.txt');

let parsed: Parsed;

/** Replicates SarDataBridge.updatePeakCpu: max %usr over CPU "all" rows. */
function peakCpuAll(): number {
  const rows = (win._idx as Record<string, string[]>)['CPU-%usr'] || [];
  let peak = 0;
  rows.forEach((line) => {
    const parts = line.split(',');
    if (parts[2] !== 'all') return;
    const value = parseFloat(parts[3]);
    if (value > peak) peak = value;
  });
  return parseInt(String(peak), 10);
}

function peakOf(points: Array<[number, number | null | undefined]>): number {
  let peak = 0;
  points.forEach(([, value]) => {
    if (typeof value === 'number' && value > peak) peak = value;
  });
  return parseInt(String(peak), 10);
}

before(async () => {
  const text = readFileSync(fixturePath, 'utf8');
  parsed = await parseSarTextChunked(text);
  setSarData(parsed);
});

test('parsed server metadata (host, OS, kernel, CPU count, date)', () => {
  const fields = parsed.firstLine.split(',');
  assert.equal(fields[0], 'Linux');
  assert.equal(fields[1], '5.14.0-570.62.1.el9_6.x86_64');
  assert.equal(fields[2], '(sample-server)');
  assert.equal(fields[3], '04/01/26');
  assert.ok(parsed.firstLine.includes('64'), 'first line records the 64 CPU count');
  assert.deepEqual(parsed.dates, ['04/01/26'], 'single-day fixture');
});

test('available categories: exact set of parsed section keys', () => {
  const keys = Object.keys(parsed.index).sort();
  assert.deepEqual(keys, [
    'CPU-%usr',
    'CPU-total/s',
    'DEV-tps',
    'IFACE-rxerr/s',
    'IFACE-rxpck/s',
    'TTY-rcvin/s',
    'call/s-retrans/s',
    'dentunusd-file-nr',
    'kbhugfree-kbhugused',
    'kbmemfree-kbavail',
    'kbswpfree-kbswpused',
    'pgpgin/s-pgpgout/s',
    'proc/s-cswch/s',
    'pswpin/s-pswpout/s',
    'runq-sz-plist-sz',
    'scall/s-badcall/s',
    'totsck-tcpsck',
    'tps-rtps'
  ]);
  assert.equal(parsed.headers.length, 18, 'one header per section');
});

test('peak CPU / load / memory match the dashboard KPIs', () => {
  assert.equal(peakCpuAll(), 15, 'Peak CPU %usr (all cores)');
  assert.equal(peakOf(getGenericData('runq-sz-plist-sz', 1)), 44, 'Peak Load (runq-sz)');

  const memHeader = grepHeader('kbmemfree');
  assert.ok(memHeader, 'memory header present');
  const cols = memHeader!.split(',');
  const memKey = cols.slice(0, 2).join('-');
  const memIdx = cols.indexOf('%memused') + 1;
  assert.equal(memKey, 'kbmemfree-kbavail');
  assert.equal(peakOf(getGenericData(memKey, memIdx)), 5, 'Peak Memory %memused');
});

test('CPU / device / interface counts', () => {
  const cpuIds = uniqueIds('CPU-%usr');
  assert.equal(cpuIds.length, 65, '64 cores + "all"');
  assert.equal(cpuIds[0], '0');
  assert.equal(cpuIds[cpuIds.length - 1], 'all');

  assert.deepEqual(uniqueIds('DEV-tps'), [
    'dev259-0',
    'nvme0n1',
    'VolGroup-lv_data',
    'VolGroup-lv_home',
    'VolGroup-lv_opt',
    'VolGroup-lv_root',
    'VolGroup-lv_swap',
    'VolGroup-lv_tmp',
    'VolGroup-lv_var',
    'VolGroup-lv_var_log',
    'VolGroup-lv_var_log_audit'
  ]);

  assert.deepEqual(uniqueIds('IFACE-rxpck/s'), [
    'bond0',
    'bond0.407',
    'bond0.470',
    'bond0.472',
    'eth0',
    'eth1',
    'eth2',
    'eth3',
    'eth4',
    'eth5',
    'lo'
  ]);
});

test('representative chart series shape and values', () => {
  // Load series: one point per sampled interval, chronologically sorted.
  const load = getGenericData('runq-sz-plist-sz', 1);
  assert.equal(load.length, 143, 'load sample count');
  for (let i = 1; i < load.length; i += 1) {
    assert.ok(load[i][0] >= load[i - 1][0], 'points sorted by timestamp');
  }

  // Per-device series align with the device id list.
  const dev = getDeviceSeries('DEV-tps');
  assert.equal(dev.ids.length, 11);
  assert.equal(dev.tps.length, 11);
  assert.equal(dev.utilPercent.length, 11);
  assert.ok(dev.tps[0].length > 0, 'first device has tps samples');

  // Per-interface traffic series align with the interface id list.
  const iface = getInterfaceTrafficSeries('IFACE-rxpck/s');
  assert.equal(iface.ids.length, 11);
  assert.equal(iface.rxkB.length, 11);
  assert.equal(iface.txkB.length, 11);
});

test('date filter narrows and restores the active index', () => {
  const key = 'CPU-%usr';
  const fullCount = ((win._idx as Record<string, string[]>)[key] || []).length;
  assert.ok(fullCount > 0, 'baseline rows present');

  // Filtering to the fixture's only date keeps every row.
  filterSarDataByDates(['04/01/26']);
  assert.equal((win._idx as Record<string, string[]>)[key].length, fullCount);

  // Filtering to a date not in the fixture empties the section.
  filterSarDataByDates(['01/01/00']);
  assert.equal((win._idx as Record<string, string[]>)[key].length, 0);

  // Clearing the filter restores the full index.
  filterSarDataByDates(null);
  assert.equal((win._idx as Record<string, string[]>)[key].length, fullCount);
});
