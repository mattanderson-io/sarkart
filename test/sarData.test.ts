/**
 * Unit coverage for the pure/synthetic-input helpers in
 * `src/client/lib/sarData.ts` — the header parsing and series extraction that
 * every chart renderer in ChartRouterBridge depends on. The existing
 * regression suite exercises these transitively through one Linux fixture;
 * these tests pin the string/column logic directly with small synthetic inputs
 * (missing columns, duplicate ids, natural sort, skipped rows).
 *
 * Runs on Node's built-in test runner with native TypeScript type-stripping
 * (no extra dependencies): `npm test`. The helpers read the parsed data from
 * `sarStore`, so each test seeds it via `setSarData` with a synthetic index.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const win: Record<string, unknown> = {};
(globalThis as unknown as { window: unknown }).window = win;

const {
  grepHeader,
  headerSectionKey,
  headerColumnIndex,
  uniqueIds,
  getGenericData,
  getSeriesWithPeak
} = await import('../src/client/lib/sarData.ts');
const { setSarData } = await import('../src/client/lib/sarStore.ts');

/** Seed the store with a synthetic index/headers (no real parse needed). */
function store(index: Record<string, string[]>, headers: string[] = []) {
  setSarData({ firstLine: '', headers, index, fullIndex: index, dates: [] });
}

test('headerSectionKey: joins the first two column tokens with a dash', () => {
  assert.equal(headerSectionKey('kbmemfree,kbavail,kbmemused,%memused'), 'kbmemfree-kbavail');
  assert.equal(headerSectionKey('runq-sz,plist-sz,ldavg-1'), 'runq-sz-plist-sz');
  // Fewer than two tokens: slice(0,2) just returns what's there.
  assert.equal(headerSectionKey('solo'), 'solo');
  assert.equal(headerSectionKey(''), '');
});

test('headerColumnIndex: 1-based index of a column, 0 when absent', () => {
  const header = 'kbmemfree,kbavail,kbmemused,%memused';
  assert.equal(headerColumnIndex(header, 'kbmemfree'), 1);
  assert.equal(headerColumnIndex(header, '%memused'), 4);
  // Missing column -> indexOf(-1) + 1 -> 0 (the documented fallback).
  assert.equal(headerColumnIndex(header, 'nope'), 0);
});

test('grepHeader: first header containing the pattern, else null', () => {
  store({}, ['runq-sz,plist-sz,ldavg-1,ldavg-5', 'kbmemfree,kbavail,%memused']);
  assert.equal(grepHeader('ldavg'), 'runq-sz,plist-sz,ldavg-1,ldavg-5');
  assert.equal(grepHeader('%memused'), 'kbmemfree,kbavail,%memused');
  assert.equal(grepHeader('does-not-exist'), null);

  // No headers loaded -> null (rather than throwing).
  store({}, []);
  assert.equal(grepHeader('anything'), null);
});

test('uniqueIds: de-duplicates the id column with a natural sort', () => {
  store({
    'DEV-tps': [
      'DEV-tps,04/01/26|09:00:00,sdb,1',
      'DEV-tps,04/01/26|09:00:00,sda,1',
      'DEV-tps,04/01/26|10:00:00,sda,1',
      'DEV-tps,04/01/26|10:00:00,sdc,1'
    ],
    nums: ['nums,04/01/26|09:00:00,10', 'nums,04/01/26|09:00:00,2', 'nums,04/01/26|09:00:00,1']
  });
  assert.deepEqual(uniqueIds('DEV-tps'), ['sda', 'sdb', 'sdc']);
  // Natural (numeric) ordering, not lexicographic ("10" after "2").
  assert.deepEqual(uniqueIds('nums'), ['1', '2', '10']);
  // Unknown key -> empty.
  assert.deepEqual(uniqueIds('missing'), []);
});

test('getGenericData: extracts a sorted series, skipping startup/average/foreign rows', () => {
  store({
    mysec: [
      'mysec,04/01/26|09:00:00,10',
      'mysec,04/01/26|10:00:00,30',
      'mysec,04/01/26|08:00:00,20',   // out of order -> should sort to the front
      'mysec,04/01/26|00:00:01,99',   // sar startup line -> skipped
      'mysec,04/01/26|Average:,88',   // "Average:" summary row -> skipped
      'other,04/01/26|11:00:00,77'    // wrong section key (parts[0]) -> skipped
    ]
  });

  const series = getGenericData('mysec', 1);
  assert.equal(series.length, 3, 'startup, average, and foreign rows excluded');
  // Sorted ascending by timestamp: 08:00 (20), 09:00 (10), 10:00 (30).
  assert.deepEqual(series.map((point) => point[1]), [20, 10, 30]);
  for (let i = 1; i < series.length; i += 1) {
    assert.ok(series[i][0] >= series[i - 1][0], 'points sorted by timestamp');
  }
});

test('getSeriesWithPeak: reports the peak value and its date/time', () => {
  store({
    mysec: [
      'mysec,04/01/26|09:00:00,10',
      'mysec,04/01/26|10:00:00,30',   // the peak
      'mysec,04/01/26|08:00:00,20',
      'mysec,04/01/26|00:00:01,99',   // startup row -> excluded from peak too
      'mysec,04/01/26|Average:,88'    // average row -> excluded
    ]
  });

  const { points, peakValue, peakTime } = getSeriesWithPeak('mysec', 1);
  assert.equal(points.length, 3);
  assert.equal(peakValue, 30);
  assert.equal(peakTime, '04/01/26 10:00:00');

  // Empty section: peak defaults to 0 / '' (matches the legacy initial bound).
  store({ mysec: [] });
  const empty = getSeriesWithPeak('mysec', 1);
  assert.deepEqual(empty.points, []);
  assert.equal(empty.peakValue, 0);
  assert.equal(empty.peakTime, '');
});
