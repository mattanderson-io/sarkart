/**
 * Unit coverage for the aggregation layer in `src/client/lib/sarStats.ts`
 * (`metricStats`, `hourGrid`, `cpuAll`, `findKey`) — the summary/heatmap math
 * behind `AiSummary` and `HeatmapDashboard`, previously only exercised through
 * the components. Pins the reducer/percentile/binning logic with small
 * synthetic inputs.
 *
 * Runs on Node's built-in test runner with TypeScript type-stripping (no deps).
 * The helpers read the parsed index from `sarStore`; each test seeds it with
 * `setSarData`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { metricStats, hourGrid, cpuAll, findKey } = await import('../src/client/lib/sarStats.ts');
const { setSarData } = await import('../src/client/lib/sarStore.ts');

function store(index: Record<string, string[]>) {
  setSarData({ firstLine: '', headers: [], index, fullIndex: index, dates: [] });
}

test('metricStats: mean/min/max/percentiles/highCount over filtered rows', () => {
  store({
    'CPU-%usr': [
      'CPU-%usr,04/01/26|09:00:00,all,10',
      'CPU-%usr,04/01/26|10:00:00,all,30',
      'CPU-%usr,04/01/26|11:00:00,all,90',  // >= threshold
      'CPU-%usr,04/01/26|09:00:00,0,50'      // core 0 -> excluded by cpuAll
    ]
  });

  const s = metricStats('CPU-%usr', 3, { threshold: 80, filter: cpuAll });
  assert.ok(s);
  assert.equal(s!.count, 3, 'only the three "all" rows');
  assert.equal(s!.min, 10);
  assert.equal(s!.max, 90);
  assert.equal(s!.p50, 30, 'median of [10,30,90]');
  assert.equal(s!.p95, 90);
  assert.equal(s!.highCount, 1, 'one value >= 80');
  assert.ok(Math.abs(s!.mean - 130 / 3) < 1e-9);

  // Empty / unknown section -> null.
  assert.equal(metricStats('missing', 3), null);
});

test('hourGrid: bins by date × hour with max and sum reducers', () => {
  store({
    mysec: [
      'mysec,04/01/26|09:15:00,5',
      'mysec,04/01/26|09:45:00,15',  // same date+hour as above
      'mysec,04/02/26|09:00:00,7'
    ]
  });

  const max = hourGrid('mysec', 2);
  assert.ok(max);
  assert.deepEqual(max!.x, ['04/01/26', '04/02/26'], 'dates sorted chronologically');
  assert.equal(max!.y[9], '09:00');
  assert.deepEqual(max!.z[9], [15, 7], 'max reducer keeps the larger of the hour');
  assert.deepEqual(max!.z[0], [0, 0], 'unsampled hours are zero-filled');

  const sum = hourGrid('mysec', 2, { reducer: 'sum' });
  assert.deepEqual(sum!.z[9], [20, 7], 'sum reducer adds within the hour');

  // No rows -> null (so the dashboard can skip the panel).
  assert.equal(hourGrid('missing', 2), null);
});

test('cpuAll: matches only the aggregate "all" core row', () => {
  assert.equal(cpuAll(['CPU-%usr', '04/01/26|09:00:00', 'all', '10']), true);
  assert.equal(cpuAll(['CPU-%usr', '04/01/26|09:00:00', '0', '10']), false);
});

test('findKey: first active section key with the given prefix, else null', () => {
  store({ 'runq-sz-plist-sz': [], 'CPU-%usr': [] });
  assert.equal(findKey('runq-sz'), 'runq-sz-plist-sz');
  assert.equal(findKey('CPU'), 'CPU-%usr');
  assert.equal(findKey('nope'), null);
});
