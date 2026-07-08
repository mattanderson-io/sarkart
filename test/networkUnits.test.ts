/**
 * Unit coverage for the pure network-unit conversion helpers in
 * `src/client/lib/networkUnits.ts`. These back the Interface Traffic "Display
 * units" toolbar (NetworkUnitBridge) and the KPI byte formatting — the
 * auto-unit thresholds and the kB/s relabel regexes are easy to break and were
 * previously unverified.
 *
 * Runs on Node's built-in test runner with native TypeScript type-stripping
 * (no extra dependencies): `npm test`. Lives outside `src/client` so it is not
 * part of the Vite build or the app's `tsc` typecheck.
 *
 * networkUnits.ts reads global `localStorage` and dispatches a `CustomEvent`
 * via `window` at call time (never at import), so a tiny in-memory shim is all
 * that's required — no jsdom.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// -- Minimal browser shims (call-time only; no top-level module access) ------
const storage = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (key: string) => (storage.has(key) ? storage.get(key)! : null),
  setItem: (key: string, value: string) => { storage.set(key, String(value)); },
  removeItem: (key: string) => { storage.delete(key); },
  clear: () => storage.clear(),
  key: () => null,
  get length() { return storage.size; }
};
(globalThis as unknown as { window: unknown }).window = { dispatchEvent: () => true };
(globalThis as unknown as { CustomEvent: unknown }).CustomEvent = class {
  type: string;
  detail: unknown;
  constructor(type: string, init?: { detail?: unknown }) {
    this.type = type;
    this.detail = init?.detail;
  }
};

const {
  networkUnits,
  defaultNetworkUnit,
  pickAutoUnit,
  resolveNetworkUnit,
  convertSeries,
  convertKBs,
  relabelSeries,
  relabelAxisTitle,
  looksLikeNetworkBytesChart,
  findSeriesPeak,
  getNetworkUnit,
  setNetworkUnit
} = await import('../src/client/lib/networkUnits.ts');

// KB/s -> Mbps multiplier (8 bits/byte, /1000 for k->M on a per-second rate).
const MBPS_FACTOR = 8192 / 1e6;

test('pickAutoUnit: non-positive and non-finite peaks fall back to Mbps', () => {
  assert.equal(pickAutoUnit(0), 'Mbps');
  assert.equal(pickAutoUnit(-5), 'Mbps');
  assert.equal(pickAutoUnit(Number.NaN), 'Mbps');
  assert.equal(pickAutoUnit(Number.POSITIVE_INFINITY), 'Mbps');
});

test('pickAutoUnit: thresholds map KB/s peaks to a sensible unit', () => {
  // < 1 Mbps stays in KB/s. 122 KB/s ~= 0.9995 Mbps (just under the cutoff).
  assert.equal(pickAutoUnit(50), 'KB/s');
  assert.equal(pickAutoUnit(122), 'KB/s');

  // Crossing 1 Mbps switches to Mbps. 123 KB/s ~= 1.0076 Mbps.
  assert.equal(pickAutoUnit(123), 'Mbps');
  assert.equal(pickAutoUnit(500), 'Mbps');

  // >= 800 Mbps switches to Gbps. 100000 KB/s ~= 819.2 Mbps.
  assert.equal(pickAutoUnit(100000), 'Gbps');
  // Exactly on the 800 Mbps boundary.
  assert.equal(pickAutoUnit(800 / MBPS_FACTOR), 'Gbps');
});

test('resolveNetworkUnit: fixed units return their own factor and suffix', () => {
  const kb = resolveNetworkUnit('KB/s', 0);
  assert.deepEqual(kb, { name: 'KB/s', factor: 1, suffix: 'KB/s' });

  const mb = resolveNetworkUnit('MB/s', 0);
  assert.equal(mb.name, 'MB/s');
  assert.equal(mb.factor, 1024 / 1e6);
  assert.equal(mb.suffix, 'MB/s');

  const mbps = resolveNetworkUnit('Mbps', 0);
  assert.equal(mbps.factor, MBPS_FACTOR);
  assert.equal(mbps.suffix, 'Mbps');
});

test('resolveNetworkUnit: Auto resolves to a concrete unit and its factor', () => {
  const auto = resolveNetworkUnit('Auto', 100000);
  assert.equal(auto.name, 'Gbps');
  assert.equal(auto.factor, networkUnits.Gbps.factor);
  assert.equal(auto.suffix, 'Gbps');

  // Auto never leaks a null factor even though networkUnits.Auto.factor is null.
  const autoLow = resolveNetworkUnit('Auto', 10);
  assert.equal(autoLow.name, 'KB/s');
  assert.equal(autoLow.factor, 1);
});

test('convertSeries: scales numeric y values and preserves gaps', () => {
  const input = [
    { name: 'rxkB/s', data: [[0, 10], [1, null], [2, 20]] as Array<[number, number | null]> }
  ];
  const out = convertSeries(input as never, 2);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].data, [[0, 20], [1, null], [2, 40]]);
});

test('convertSeries: tolerates missing data arrays', () => {
  const out = convertSeries([{ name: 'x' }] as never, 4);
  assert.deepEqual(out[0].data, []);
});

test('findSeriesPeak: returns the max finite y across all series', () => {
  const series = [
    { name: 'a', data: [[0, 10], [1, 50]] as Array<[number, number]> },
    { name: 'b', data: [[0, 30], [1, Number.NaN]] as Array<[number, number]> }
  ];
  assert.equal(findSeriesPeak(series as never), 50);
  assert.equal(findSeriesPeak([] as never), 0);
});

test('convertKBs: uses the stored unit', () => {
  setNetworkUnit('KB/s');
  const asKb = convertKBs(256);
  assert.equal(asKb.value, 256);
  assert.equal(asKb.suffix, 'KB/s');

  setNetworkUnit('Mbps');
  const asMbps = convertKBs(1000);
  assert.equal(asMbps.suffix, 'Mbps');
  assert.equal(asMbps.value, 1000 * MBPS_FACTOR);
});

test('relabelSeries: swaps kB/s tokens for the resolved suffix and trims boilerplate', () => {
  assert.equal(
    relabelSeries('Total number of kilobytes received per second (rxkB/s)', 'Mbps'),
    'received per second (Mbps)'
  );
  assert.equal(relabelSeries('txkB/s', 'Gbps'), 'Gbps');
  // Undefined names pass through untouched.
  assert.equal(relabelSeries(undefined, 'Mbps'), undefined);
});

test('relabelAxisTitle: swaps kB/s tokens and normalizes pipe spacing', () => {
  assert.equal(relabelAxisTitle('rxkB/s | txkB/s', 'Mbps'), 'Mbps | Mbps');
  assert.equal(relabelAxisTitle('rxkB/s|txkB/s', '%'), '% | %');
});

test('looksLikeNetworkBytesChart: detects kB/s and kilobytes signatures', () => {
  assert.equal(looksLikeNetworkBytesChart('rxkB/s | txkB/s', []), true);
  assert.equal(
    looksLikeNetworkBytesChart('', [{ name: 'Total number of kilobytes received (rxkB/s)' }] as never),
    true
  );
  // Non-byte charts (e.g. packet rates) are left alone.
  assert.equal(
    looksLikeNetworkBytesChart('rxpck/s | txpck/s', [{ name: 'packets per second' }] as never),
    false
  );
});

test('getNetworkUnit / setNetworkUnit: round-trip and invalid fallback', () => {
  setNetworkUnit('Gbps');
  assert.equal(getNetworkUnit(), 'Gbps');

  // A stored value that is not a known unit falls back to the default.
  storage.set('sarkart.netUnit', 'bogus-unit');
  assert.equal(getNetworkUnit(), defaultNetworkUnit);
  assert.equal(defaultNetworkUnit, 'Mbps');
});
