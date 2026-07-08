/**
 * Fixture coverage for the date-filter → re-index → per-core-CPU flow.
 *
 * When the date filter changes, `sarStore.filterSarDataByDates` swaps the
 * active index (`window._idx`) to a filtered subset, and the dashboard rebuilds
 * the per-core CPU index (`window._cpuByCore`, which `getCPU` reads) from it via
 * `cpuIndex.buildCpuByCore`. If that rebuild is skipped or reads stale data the
 * per-core charts silently show pre-filter data — this locks the chain down.
 *
 * Drives the REAL modules the app uses (`parseSarTextChunked` → `setSarData` →
 * `filterSarDataByDates` → `buildCpuByCore` → `getCPU`), not reimplementations.
 * Runs on Node's built-in test runner with TypeScript type-stripping — no deps.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

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
const { buildCpuByCore } = await import('../src/client/lib/cpuIndex.ts');
const { getCPU } = await import('../src/client/lib/sarData.ts');
const { setSarData, filterSarDataByDates, getRows, setCpuByCore, getCpuByCore } = await import('../src/client/lib/sarStore.ts');

const fixturePath = path.join(import.meta.dirname, '..', 'public', 'sample', 'sample-sar.txt');

/** Mirrors SarDataBridge.rebuildCpuByCore: build from the active index + publish. */
async function reindex(chunkSize?: number) {
  const lines = getRows('CPU-%usr');
  const { ids, byCore } = await buildCpuByCore(lines, chunkSize ? { chunkSize } : {});
  setCpuByCore(byCore);
  return ids;
}

before(async () => {
  const text = readFileSync(fixturePath, 'utf8');
  setSarData(await parseSarTextChunked(text));
});

test('buildCpuByCore groups all cores + "all", naturally sorted', async () => {
  const ids = await reindex();
  assert.equal(ids.length, 65, '64 cores + "all"');
  // Natural (not lexicographic) sort: 0,1,2,… — lexicographic would put "10" at index 2.
  assert.equal(ids[0], '0');
  assert.equal(ids[1], '1');
  assert.equal(ids[2], '2');
  assert.equal(ids[ids.length - 1], 'all', '"all" sorts after the numeric cores');

  const byCore = getCpuByCore();
  assert.equal(Object.keys(byCore).length, 65);
  assert.ok(byCore['all'].length > 0, '"all" core has rows');
  // Every row filed under a core id actually belongs to that core (column 2).
  assert.ok(byCore['0'].every((line) => line.split(',')[2] === '0'));
});

test('getCPU reads the rebuilt per-core index', async () => {
  await reindex();
  const all = getCPU('all', 2);
  const core0 = getCPU('0', 2);
  assert.ok(all.length > 0, '"all" core has a %usr series');
  assert.equal(core0.length, all.length, 'every core sampled at the same cadence');
  // Chronologically sorted timestamps.
  for (let i = 1; i < all.length; i += 1) {
    assert.ok(all[i][0] >= all[i - 1][0], 'points sorted by timestamp');
  }
});

test('chunked build matches a single-pass build', async () => {
  const lines = getRows('CPU-%usr');
  const chunked = await buildCpuByCore(lines, { chunkSize: 3 });
  const single = await buildCpuByCore(lines, { chunkSize: lines.length + 1 });
  assert.deepEqual(chunked.ids, single.ids, 'chunk boundaries do not change core ids');
  assert.deepEqual(chunked.byCore['all'], single.byCore['all'], 'rows preserved across chunks');
});

test('date filter narrows the re-indexed per-core data, then restores', async () => {
  const fullSeries = getCPU('all', 2).length;
  assert.ok(fullSeries > 0, 'baseline per-core series present');

  // Filter to the fixture's only date: everything is kept.
  filterSarDataByDates(['04/01/26']);
  const keptIds = await reindex();
  assert.equal(keptIds.length, 65);
  assert.equal(getCPU('all', 2).length, fullSeries, 'single-day fixture keeps all samples');

  // Filter to a date not in the fixture: the CPU index empties, so the rebuild
  // must yield no cores and getCPU must return an empty series (not stale data).
  filterSarDataByDates(['01/01/00']);
  const emptyIds = await reindex();
  assert.deepEqual(emptyIds, [], 'no cores after filtering to a bogus date');
  assert.deepEqual(getCPU('all', 2), [], 'per-core series empties, not stale');

  // Clearing the filter restores the full per-core data.
  filterSarDataByDates(null);
  const restoredIds = await reindex();
  assert.equal(restoredIds.length, 65);
  assert.equal(getCPU('all', 2).length, fullSeries, 'restored to the full series');
});
