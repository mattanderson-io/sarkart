/**
 * Aggregation layer over the parsed SAR index: summary statistics
 * (`metricStats`), time-of-day × date heatmap grids (`hourGrid` and the
 * per-metric `memoryHeatmap`/`networkHeatmap`/`diskHeatmap`), and small
 * host/CPU-count helpers.
 *
 * Split out of `sarData.ts` so the per-category chart *series* getters stay
 * separate from this whole-file *aggregation*. Reads the active section index
 * from `sarStore`; consumers are `HeatmapDashboard` and `PlotlyHeatmap`.
 */
import { getHostname, getOS } from './sarEngine.ts';
import { getActiveIndex, getDates, getHeaders, getRows } from './sarStore.ts';

/** A parsed SAR data row split on commas: [sectionKey, "date|time", ...cols]. */
export type SarRow = string[];

export type MetricStats = {
  mean: number;
  max: number;
  min: number;
  p95: number;
  p50: number;
  count: number;
  highCount: number;
};

export type HeatmapGrid = {
  z: number[][];
  x: string[];
  y: string[];
  unitLabel?: string;
};

export function lines(key: string) {
  return getRows(key);
}

export function rows(key: string): SarRow[] {
  return lines(key).map((line) => line.split(','));
}

export function findKey(prefix: string) {
  return Object.keys(getActiveIndex()).find((key) => key.startsWith(prefix)) || null;
}

function columnIndex(headerPrefix: string, columnName: string, fallback: number) {
  const header = getHeaders().find((item) => item.includes(headerPrefix));
  if (!header) return fallback;
  const index = header.split(',').indexOf(columnName);
  return index >= 0 ? index + 2 : fallback;
}

function dateKey(value: string) {
  const parts = value.split('/');
  if (parts.length !== 3) return 0;
  return Number(parts[2]) * 10000 + Number(parts[0]) * 100 + Number(parts[1]);
}

function dateSort(a: string, b: string) {
  return dateKey(a) - dateKey(b);
}

function dateHour(row: SarRow) {
  const dateTime = (row[1] || '').split('|');
  const date = dateTime[0];
  const time = dateTime[1];
  if (!date || !time) return null;
  const hour = parseInt(time.split(':')[0], 10);
  if (!Number.isFinite(hour)) return null;
  return { date, hour };
}

function numericValues(key: string, colIndex: number, filter?: (row: SarRow) => boolean) {
  const values: number[] = [];
  rows(key).forEach((row) => {
    if (filter && !filter(row)) return;
    const value = parseFloat(row[colIndex]);
    if (Number.isFinite(value)) values.push(value);
  });
  return values;
}

export function metricStats(key: string, colIndex: number, options: { threshold?: number; filter?: (row: SarRow) => boolean } = {}): MetricStats | null {
  const values = numericValues(key, colIndex, options.filter);
  if (!values.length) return null;

  values.sort((a, b) => a - b);
  const sum = values.reduce((total, value) => total + value, 0);
  const threshold = options.threshold ?? 80;
  return {
    mean: sum / values.length,
    max: values[values.length - 1],
    min: values[0],
    p95: values[Math.floor(values.length * 0.95)],
    p50: values[Math.floor(values.length * 0.5)],
    count: values.length,
    highCount: values.filter((value) => value >= threshold).length
  };
}

export function hourGrid(
  key: string,
  colIndex: number,
  options: {
    filter?: (row: SarRow) => boolean;
    reducer?: 'max' | 'sum';
    value?: (row: SarRow) => number;
  } = {}
): HeatmapGrid | null {
  const grid: Record<string, Record<number, number>> = {};
  const dates = new Set<string>();
  const reducer = options.reducer || 'max';

  rows(key).forEach((row) => {
    if (options.filter && !options.filter(row)) return;
    const point = dateHour(row);
    if (!point) return;

    const value = options.value ? options.value(row) : parseFloat(row[colIndex]);
    if (!Number.isFinite(value)) return;

    grid[point.date] ||= {};
    if (reducer === 'sum') {
      grid[point.date][point.hour] = (grid[point.date][point.hour] || 0) + value;
    } else if (!grid[point.date][point.hour] || value > grid[point.date][point.hour]) {
      grid[point.date][point.hour] = value;
    }
    dates.add(point.date);
  });

  const dateList = Array.from(dates).sort(dateSort);
  if (!dateList.length) return null;

  const z = Array.from({ length: 24 }, (_unused, hour) => {
    return dateList.map((date) => grid[date]?.[hour] || 0);
  });
  const y = Array.from({ length: 24 }, (_unused, hour) => `${hour < 10 ? '0' : ''}${hour}:00`);
  return { z, x: dateList, y };
}

export function cpuAll(row: SarRow) {
  return row[2] === 'all';
}

export function hostInfo() {
  return { hostname: getHostname(), os: getOS(), days: getDates().length };
}

export function cpuCount() {
  return document.querySelectorAll('#ulCPU li').length || 1;
}

export function memoryHeatmap() {
  const key = findKey('kbmemfree');
  if (!key) return null;
  return hourGrid(key, columnIndex('kbmemfree', '%memused', 5));
}

export function networkHeatmap(convertKBs?: (kbs: number) => { value: number; suffix: string }) {
  const raw = hourGrid('IFACE-rxpck/s', 0, {
    reducer: 'sum',
    value: (row) => (parseFloat(row[5]) || 0) + (parseFloat(row[6]) || 0)
  });
  if (!raw) return null;
  if (!convertKBs) return { ...raw, unitLabel: ' KB/s' };

  let peak = 0;
  raw.z.forEach((row) => row.forEach((value) => { if (value > peak) peak = value; }));
  const convertedPeak = convertKBs(peak);
  const factor = peak > 0 ? convertedPeak.value / peak : 1;
  return {
    ...raw,
    z: raw.z.map((row) => row.map((value) => value * factor)),
    unitLabel: ` ${convertedPeak.suffix}`
  };
}

export function diskHeatmap() {
  return hourGrid('DEV-tps', 0, {
    reducer: 'sum',
    value: (row) => parseFloat(row[3]) || 0
  });
}
