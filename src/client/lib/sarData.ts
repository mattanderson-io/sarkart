export type SarRow = string[];

export type LegacyPointList = LegacyPoint[];

function toRows(key: string) {
  return window._idx?.[key] || [];
}

function convertTo24Hr(value: string) {
  if (value.length === 8 && value.charCodeAt(2) === 58 && value.charCodeAt(5) === 58) return value;
  const hourMatch = value.match(/^(\d+)/);
  const minuteMatch = value.match(/:(\d+)/);
  const secondMatch = value.match(/:(\d+):(\d+)/);
  const meridiemMatch = value.match(/:([^:]*)$/);
  let hour = Number(hourMatch?.[1]);
  const minute = Number(minuteMatch?.[1]);
  let second = Number(secondMatch?.[2]);
  const meridiem = meridiemMatch?.[1];
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour -= 12;
  const hh = hour < 10 ? `0${hour}` : String(hour);
  const mm = minute < 10 ? `0${minute}` : String(minute);
  const ss = second < 10 ? `0${second}` : String(second);
  return `${hh}:${mm}:${ss}`;
}

const timestampCache: Record<string, number> = {};

function toTimestamp(dateStr: string, timeStr: string) {
  const cacheKey = `${dateStr}|${timeStr}`;
  const cached = timestampCache[cacheKey];
  if (cached !== undefined) return cached;

  const dateParts = dateStr.split('/');
  const timeParts = timeStr.split(':');
  let year = parseInt(dateParts[2], 10);
  const month = parseInt(dateParts[0], 10) - 1;
  const day = parseInt(dateParts[1], 10);
  const hour = parseInt(timeParts[0], 10);
  const minute = parseInt(timeParts[1], 10);
  const second = parseInt(timeParts[2], 10) || 0;
  if (year < 100) year += year < 70 ? 2000 : 1900;

  const timestamp = Date.UTC(year, month, day, hour, minute, second);
  timestampCache[cacheKey] = timestamp;
  return timestamp;
}

/**
 * Port of the legacy `getGenericData(key, column, table, target)`.
 * Extracts a single numeric series from an indexed SAR section, skipping
 * "Average:" summary rows and the sar startup line (00:00:01 / 00:00:00).
 * When `target` is provided, mirrors the legacy side-effect of writing the
 * peak value + peak time into that DOM element (used for the peak KPI cards).
 */
export function getGenericData(key: string, column: number, target?: string | null): LegacyPointList {
  const rows = toRows(key);
  const points: LegacyPointList = [];
  // Matches the legacy tracker's initial bounds exactly (max starts at 0,
  // min starts effectively at +Infinity) so peak/trough detection behaves
  // identically for edge cases like all-zero or all-negative series.
  let peakValue = 0;
  let peakTime = '';
  let minValue = Infinity;
  let minTime = '';

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    const parts = row.split(',');
    const dateTime = (parts[1] || '').split('|');
    if (parts[0] !== key) continue;

    const date = dateTime[0];
    const time = convertTo24Hr(dateTime[1]);
    if ((dateTime[1] || '').substring(0, 5) === 'Avera') continue;
    if (time === '00:00:01' || time === '00:00:00') continue;

    const timestamp = toTimestamp(date, time);
    const value = parseFloat(parts[column + 1]);
    points.push([timestamp, value]);

    if (value > peakValue) { peakValue = value; peakTime = `${date} ${time}`; }
    if (value < minValue) { minValue = value; minTime = `${date} ${time}`; }
  }

  if (target) {
    const isSunosMemory = window.getOS?.() === 'SUNOS' && target === '#peakMemory';
    const valueEl = document.getElementById(target.replace(/^#/, ''));
    const timeEl = document.getElementById(`${target.replace(/^#/, '')}Time`);
    if (valueEl) valueEl.textContent = String(parseInt(String(isSunosMemory ? minValue : peakValue), 10));
    if (timeEl) timeEl.textContent = isSunosMemory ? minTime : peakTime;
  }

  points.sort((a, b) => a[0] - b[0]);
  return points;
}

/**
 * Port of the legacy `getMemoryFreeData` — sums three adjacent columns
 * (kbmemfree + kbbuffers + kbcached) into a single series.
 */
export function getMemoryFreeData(key: string, column: number): LegacyPointList {
  const rows = toRows(key);
  const points: LegacyPointList = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    const parts = row.split(',');
    const dateTime = (parts[1] || '').split('|');
    if (parts[0] !== key) continue;

    const date = dateTime[0];
    const time = convertTo24Hr(dateTime[1]);
    if ((dateTime[1] || '').substring(0, 5) === 'Avera') continue;
    if (time === '00:00:01') continue;

    const timestamp = toTimestamp(date, time);
    const value = (parseFloat(parts[column + 1]) || 0) + (parseFloat(parts[column + 4]) || 0) + (parseFloat(parts[column + 5]) || 0);
    points.push([timestamp, value]);
  }

  points.sort((a, b) => a[0] - b[0]);
  return points;
}

/**
 * Port of the legacy `getCPU(coreId, column, table, target)`.
 * Reads from `window._cpuByCore` (built by SarDataBridge's buildCpuList),
 * matching rows for a single CPU core id (e.g. "all", "0", "1", ...).
 */
export function getCPU(coreId: string, column: number): LegacyPointList {
  const rows = window._cpuByCore?.[coreId] || [];
  const points: LegacyPointList = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    const parts = row.split(',');
    const dateTime = (parts[1] || '').split('|');
    if (parts[2] !== coreId) continue;

    if ((dateTime[1] || '').substring(0, 5) === 'Avera') continue;
    const time = convertTo24Hr(dateTime[1]);
    if (time === '00:00:01') continue;

    const timestamp = toTimestamp(dateTime[0], time);
    points.push([timestamp, parseFloat(parts[column + 1])]);
  }

  return points;
}

/**
 * Port of the legacy `getInterrupts(key, column, table, target)`.
 * Reads the "sum" rows from an INTR-style section indexed by `window._idx`.
 */
export function getInterrupts(key: string, column: number): LegacyPointList {
  const rows = (window._idx?.[key] || []).filter((row) => row.split(',')[2] === 'sum');
  const points: LegacyPointList = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    const parts = row.split(',');
    const dateTime = (parts[1] || '').split('|');
    if (parts[0] !== key) continue;

    if ((dateTime[1] || '').substring(0, 5) === 'Avera') continue;
    const time = convertTo24Hr(dateTime[1]);
    if (time === '00:00:01') continue;

    const timestamp = toTimestamp(dateTime[0], time);
    points.push([timestamp, parseFloat(parts[column + 1])]);
  }

  return points;
}

function naturalCompareStrings(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function uniqueIds(key: string) {
  const seen: Record<string, 1> = {};
  const ids: string[] = [];
  toRows(key).forEach((row) => {
    const id = row.split(',')[2];
    if (id === undefined || seen[id]) return;
    seen[id] = 1;
    ids.push(id);
  });
  ids.sort(naturalCompareStrings);
  return ids;
}

export type DeviceSeries = {
  ids: string[];
  tps: LegacyPointList[];
  readSectors: LegacyPointList[];
  writeSectors: LegacyPointList[];
  avgRqSize: LegacyPointList[];
  avgQueueSize: LegacyPointList[];
  await: LegacyPointList[];
  serviceTime: LegacyPointList[];
  utilPercent: LegacyPointList[];
};

/**
 * Port of the legacy `getDevices(key, table, target)`.
 * Splits a DEV-tps style section into per-device series, keyed by device id.
 * Column layout (0-indexed after the date|time field):
 *   3 tps, 4 rd_sec/s, 5 wr_sec/s, 6 avgrq-sz, 7 avgqu-sz, 8 await, 9 svctm, 10 %util
 */
export function getDeviceSeries(key: string): DeviceSeries {
  const rows = toRows(key);
  const ids = uniqueIds(key);
  const idIndex: Record<string, number> = {};
  ids.forEach((id, index) => { idIndex[id] = index; });

  const tps: LegacyPointList[] = ids.map(() => []);
  const readSectors: LegacyPointList[] = ids.map(() => []);
  const writeSectors: LegacyPointList[] = ids.map(() => []);
  const avgRqSize: LegacyPointList[] = ids.map(() => []);
  const avgQueueSize: LegacyPointList[] = ids.map(() => []);
  const awaitTime: LegacyPointList[] = ids.map(() => []);
  const serviceTime: LegacyPointList[] = ids.map(() => []);
  const utilPercent: LegacyPointList[] = ids.map(() => []);

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    const parts = row.split(',');
    const dateTime = (parts[1] || '').split('|');
    const deviceIndex = idIndex[parts[2]];
    if (deviceIndex === undefined) continue;

    if ((dateTime[1] || '').substring(0, 5) === 'Avera') continue;
    const time = convertTo24Hr(dateTime[1]);
    if (time === '00:00:01') continue;

    const timestamp = toTimestamp(dateTime[0], time);
    tps[deviceIndex].push([timestamp, parseFloat(parts[3])]);
    readSectors[deviceIndex].push([timestamp, parseFloat(parts[4])]);
    writeSectors[deviceIndex].push([timestamp, parseFloat(parts[5])]);
    avgRqSize[deviceIndex].push([timestamp, parseFloat(parts[6])]);
    avgQueueSize[deviceIndex].push([timestamp, parseFloat(parts[7])]);
    awaitTime[deviceIndex].push([timestamp, parseFloat(parts[8])]);
    serviceTime[deviceIndex].push([timestamp, parseFloat(parts[9])]);
    utilPercent[deviceIndex].push([timestamp, parseFloat(parts[10])]);
  }

  return { ids, tps, readSectors, writeSectors, avgRqSize, avgQueueSize, await: awaitTime, serviceTime, utilPercent };
}

export type InterfaceTrafficSeries = {
  ids: string[];
  rxpck: LegacyPointList[];
  txpck: LegacyPointList[];
  rxkB: LegacyPointList[];
  txkB: LegacyPointList[];
  rxcmp: LegacyPointList[];
  txcmp: LegacyPointList[];
  rxmcst: LegacyPointList[];
};

/**
 * Port of the legacy `getInterfaceTraffic(key, table, target)`.
 * Column layout: 3 rxpck/s, 4 txpck/s, 5 rxkB/s, 6 txkB/s, 7 rxcmp/s, 8 txcmp/s, 9 rxmcst/s
 */
export function getInterfaceTrafficSeries(key: string): InterfaceTrafficSeries {
  const rows = toRows(key);
  const ids = uniqueIds(key);
  const idIndex: Record<string, number> = {};
  ids.forEach((id, index) => { idIndex[id] = index; });

  const rxpck: LegacyPointList[] = ids.map(() => []);
  const txpck: LegacyPointList[] = ids.map(() => []);
  const rxkB: LegacyPointList[] = ids.map(() => []);
  const txkB: LegacyPointList[] = ids.map(() => []);
  const rxcmp: LegacyPointList[] = ids.map(() => []);
  const txcmp: LegacyPointList[] = ids.map(() => []);
  const rxmcst: LegacyPointList[] = ids.map(() => []);

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    const parts = row.split(',');
    const dateTime = (parts[1] || '').split('|');
    const index = idIndex[parts[2]];
    if (index === undefined) continue;

    if ((dateTime[1] || '').substring(0, 5) === 'Avera') continue;
    const time = convertTo24Hr(dateTime[1]);
    if (time === '00:00:01') continue;

    const timestamp = toTimestamp(dateTime[0], time);
    rxpck[index].push([timestamp, parseFloat(parts[3])]);
    txpck[index].push([timestamp, parseFloat(parts[4])]);
    rxkB[index].push([timestamp, parseFloat(parts[5])]);
    txkB[index].push([timestamp, parseFloat(parts[6])]);
    rxcmp[index].push([timestamp, parseFloat(parts[7])]);
    txcmp[index].push([timestamp, parseFloat(parts[8])]);
    rxmcst[index].push([timestamp, parseFloat(parts[9])]);
  }

  return { ids, rxpck, txpck, rxkB, txkB, rxcmp, txcmp, rxmcst };
}

export type InterfaceErrorSeries = {
  ids: string[];
  rxerr: LegacyPointList[];
  txerr: LegacyPointList[];
  coll: LegacyPointList[];
  rxdrop: LegacyPointList[];
  txdrop: LegacyPointList[];
  txcarr: LegacyPointList[];
  rxfram: LegacyPointList[];
  rxfifo: LegacyPointList[];
  txfifo: LegacyPointList[];
};

/**
 * Port of the legacy `getInterfaceErrors(key, table, target)`.
 * Column layout: 3 rxerr/s, 4 txerr/s, 5 coll/s, 6 rxdrop/s, 7 txdrop/s,
 * 8 txcarr/s, 9 rxfram/s, 10 rxfifo/s, 11 txfifo/s
 */
export function getInterfaceErrorSeries(key: string): InterfaceErrorSeries {
  const rows = toRows(key);
  const ids = uniqueIds(key);
  const idIndex: Record<string, number> = {};
  ids.forEach((id, index) => { idIndex[id] = index; });

  const rxerr: LegacyPointList[] = ids.map(() => []);
  const txerr: LegacyPointList[] = ids.map(() => []);
  const coll: LegacyPointList[] = ids.map(() => []);
  const rxdrop: LegacyPointList[] = ids.map(() => []);
  const txdrop: LegacyPointList[] = ids.map(() => []);
  const txcarr: LegacyPointList[] = ids.map(() => []);
  const rxfram: LegacyPointList[] = ids.map(() => []);
  const rxfifo: LegacyPointList[] = ids.map(() => []);
  const txfifo: LegacyPointList[] = ids.map(() => []);

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row) continue;
    const parts = row.split(',');
    const dateTime = (parts[1] || '').split('|');
    const index = idIndex[parts[2]];
    if (index === undefined) continue;

    if ((dateTime[1] || '').substring(0, 5) === 'Avera') continue;
    const time = convertTo24Hr(dateTime[1]);
    if (time === '00:00:01') continue;

    const timestamp = toTimestamp(dateTime[0], time);
    rxerr[index].push([timestamp, parseFloat(parts[3])]);
    txerr[index].push([timestamp, parseFloat(parts[4])]);
    coll[index].push([timestamp, parseFloat(parts[5])]);
    rxdrop[index].push([timestamp, parseFloat(parts[6])]);
    txdrop[index].push([timestamp, parseFloat(parts[7])]);
    txcarr[index].push([timestamp, parseFloat(parts[8])]);
    rxfram[index].push([timestamp, parseFloat(parts[9])]);
    rxfifo[index].push([timestamp, parseFloat(parts[10])]);
    txfifo[index].push([timestamp, parseFloat(parts[11])]);
  }

  return { ids, rxerr, txerr, coll, rxdrop, txdrop, txcarr, rxfram, rxfifo, txfifo };
}

/**
 * Port of the legacy `grepHeaders(pattern)` — returns the first header line
 * containing `pattern`, or null (legacy used -1; null is the typed equivalent).
 */
export function grepHeader(pattern: string): string | null {
  const headers = window.headers || [];
  const match = headers.find((header) => header.includes(pattern));
  return match ?? null;
}

/**
 * Splits a header line into its column tokens and derives the section key
 * (the first two comma-joined tokens, e.g. "CPU-all" or "DEV-sda"), matching
 * the legacy `[...tokens].splice(0, 2).join('-')` idiom used throughout the
 * category handlers.
 */
export function headerSectionKey(header: string) {
  const tokens = header.split(',');
  return tokens.slice(0, 2).join('-');
}

export function headerColumnIndex(header: string, columnName: string) {
  return header.split(',').indexOf(columnName) + 1;
}

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
  return window._idx?.[key] || [];
}

export function rows(key: string) {
  return lines(key).map((line) => line.split(','));
}

export function findKey(prefix: string) {
  return Object.keys(window._idx || {}).find((key) => key.startsWith(prefix)) || null;
}

export function columnIndex(headerPrefix: string, columnName: string, fallback: number) {
  const header = (window.headers || []).find((item) => item.includes(headerPrefix));
  if (!header) return fallback;
  const index = header.split(',').indexOf(columnName);
  return index >= 0 ? index + 2 : fallback;
}

export function dateSort(a: string, b: string) {
  const ak = dateKey(a);
  const bk = dateKey(b);
  return ak - bk;
}

function dateKey(value: string) {
  const parts = value.split('/');
  if (parts.length !== 3) return 0;
  return Number(parts[2]) * 10000 + Number(parts[0]) * 100 + Number(parts[1]);
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

export function numericValues(key: string, colIndex: number, filter?: (row: SarRow) => boolean) {
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
  let hostname = '';
  let os = '';
  try { hostname = window.getHostname?.() || ''; } catch (_error) {}
  try { os = window.getOS?.() || ''; } catch (_error) {}
  return { hostname, os, days: window._allDatesArr?.length || 0 };
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
