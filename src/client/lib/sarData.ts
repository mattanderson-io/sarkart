import { getCpuByCore, getGeneration, getHeaders, getRows } from './sarStore.ts';

export type LegacyPointList = LegacyPoint[];

function toRows(key: string) {
  return getRows(key);
}

function convertTo24Hr(value: string) {
  if (value.length === 8 && value.charCodeAt(2) === 58 && value.charCodeAt(5) === 58) return value;
  const hourMatch = value.match(/^(\d+)/);
  const minuteMatch = value.match(/:(\d+)/);
  const secondMatch = value.match(/:(\d+):(\d+)/);
  const meridiemMatch = value.match(/:([^:]*)$/);
  let hour = Number(hourMatch?.[1]);
  const minute = Number(minuteMatch?.[1]);
  const second = Number(secondMatch?.[2]);
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

export type SeriesWithPeak = {
  points: LegacyPointList;
  /** Max value across the series (0 for an empty/all-negative series). */
  peakValue: number;
  /** "MM/DD/YY HH:MM:SS" of the peak sample, or '' when there is none. */
  peakTime: string;
};

/**
 * Extracts a single numeric series from an indexed SAR section plus its peak,
 * skipping "Average:" summary rows and the sar startup line (00:00:01 /
 * 00:00:00). Pure — the peak KPI DOM write lives in the caller (see
 * SarDataBridge.writePeak), so this stays a side-effect-free transform.
 */
export function getSeriesWithPeak(key: string, column: number): SeriesWithPeak {
  const rows = toRows(key);
  const points: LegacyPointList = [];
  // Peak starts at 0 to match the legacy tracker's initial bound, so peak
  // detection behaves identically for edge cases like all-zero series.
  let peakValue = 0;
  let peakTime = '';

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
  }

  points.sort((a, b) => a[0] - b[0]);
  return { points, peakValue, peakTime };
}

// -- Column cache (PERFORMANCE.md items 2 & 4) -------------------------------
//
// The per-render chart accessors below used to split each stored row string and
// parseFloat its fields on EVERY call, so the same section got re-parsed on
// every render / CPU-core switch. Instead, parse a section's rows into sorted
// numeric columns once and cache them, keyed by an accessor-specific key. The
// cache is discarded whenever the store's data generation changes (new file,
// date filter, or per-core reindex), so it can never serve stale data.

type ColumnData = { ts: Float64Array; fields: Float64Array[]; n: number };

const columnCache = new Map<string, ColumnData>();
let columnCacheGen = -1;

function cacheGate() {
  const gen = getGeneration();
  if (gen !== columnCacheGen) {
    columnCache.clear();
    columnCacheGen = gen;
  }
}

/**
 * Parse rows into sorted numeric columns, applying the same filtering the
 * string accessors used: keep only rows matching `keep`, and skip the sar
 * startup line (00:00:00 / 00:00:01) and "Average:" summary rows. `dataStart`
 * is the parts index of the first numeric value (2 for id-less sections, 3 for
 * per-id sections such as CPU where parts[2] is the core id).
 */
function buildColumns(rows: string[], keep: (parts: string[]) => boolean, dataStart: number): ColumnData {
  const tmpTs: number[] = [];
  const tmpVals: number[][] = [];
  let ncols = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const parts = rows[i].split(',');
    if (!keep(parts)) continue;
    const dateTime = (parts[1] || '').split('|');
    if ((dateTime[1] || '').substring(0, 5) === 'Avera') continue;
    const time = convertTo24Hr(dateTime[1]);
    if (time === '00:00:01' || time === '00:00:00') continue;

    const vals: number[] = [];
    for (let k = dataStart; k < parts.length; k += 1) vals.push(parseFloat(parts[k]));
    if (vals.length > ncols) ncols = vals.length;
    tmpTs.push(toTimestamp(dateTime[0], time));
    tmpVals.push(vals);
  }

  const order = tmpTs.map((_, i) => i).sort((a, b) => tmpTs[a] - tmpTs[b]);
  const n = order.length;
  const ts = new Float64Array(n);
  const fields: Float64Array[] = [];
  for (let k = 0; k < ncols; k += 1) fields.push(new Float64Array(n));
  for (let i = 0; i < n; i += 1) {
    const src = order[i];
    ts[i] = tmpTs[src];
    const vals = tmpVals[src];
    for (let k = 0; k < ncols; k += 1) fields[k][i] = k < vals.length ? vals[k] : NaN;
  }
  return { ts, fields, n };
}

function genericColumns(key: string): ColumnData {
  cacheGate();
  let cached = columnCache.get(key);
  if (!cached) {
    cached = buildColumns(getRows(key), (parts) => parts[0] === key, 2);
    columnCache.set(key, cached);
  }
  return cached;
}

function cpuColumns(coreId: string): ColumnData {
  cacheGate();
  const cacheKey = `\u0000cpu\u0000${coreId}`;
  let cached = columnCache.get(cacheKey);
  if (!cached) {
    cached = buildColumns(getCpuByCore()[coreId] || [], (parts) => parts[2] === coreId, 3);
    columnCache.set(cacheKey, cached);
  }
  return cached;
}

/**
 * Port of the legacy `getGenericData(key, column)`. Returns just the series;
 * for the peak value/time (KPI cards) use `getSeriesWithPeak`. Reads cached
 * numeric columns (see above) rather than re-parsing row strings each call.
 */
export function getGenericData(key: string, column: number): LegacyPointList {
  const data = genericColumns(key);
  const col = data.fields[column - 1];
  const points: LegacyPointList = new Array(data.n);
  for (let i = 0; i < data.n; i += 1) points[i] = [data.ts[i], col ? col[i] : NaN];
  return points;
}

/**
 * Port of the legacy `getMemoryFreeData` — sums three adjacent columns
 * (kbmemfree + kbbuffers + kbcached) into a single series.
 */
export function getMemoryFreeData(key: string, column: number): LegacyPointList {
  const data = genericColumns(key);
  // Sums three adjacent columns: parts[column+1] + parts[column+4] + parts[column+5],
  // i.e. fields[column-1] + fields[column+2] + fields[column+3].
  const a = data.fields[column - 1];
  const b = data.fields[column + 2];
  const c = data.fields[column + 3];
  const add = (arr: Float64Array | undefined, i: number) => {
    if (!arr) return 0;
    const v = arr[i];
    return Number.isNaN(v) ? 0 : v;
  };
  const points: LegacyPointList = new Array(data.n);
  for (let i = 0; i < data.n; i += 1) points[i] = [data.ts[i], add(a, i) + add(b, i) + add(c, i)];
  return points;
}

/**
 * Port of the legacy `getCPU(coreId, column, table, target)`.
 * Reads from the per-core index (`sarStore.getCpuByCore()`, built by
 * SarDataBridge's buildCpuList), matching a single core id ("all", "0", …).
 */
export function getCPU(coreId: string, column: number): LegacyPointList {
  // CPU rows carry the core id at parts[2], so numeric values start at parts[3]
  // (dataStart 3). getCPU(coreId, 2) reads parts[3] → fields[0], i.e. field
  // index = column - 2.
  const data = cpuColumns(coreId);
  const col = data.fields[column - 2];
  const points: LegacyPointList = new Array(data.n);
  for (let i = 0; i < data.n; i += 1) points[i] = [data.ts[i], col ? col[i] : NaN];
  return points;
}

/**
 * Port of the legacy `getInterrupts(key, column, table, target)`.
 * Reads the "sum" rows from an INTR-style section in the active index.
 */
export function getInterrupts(key: string, column: number): LegacyPointList {
  const rows = getRows(key).filter((row) => row.split(',')[2] === 'sum');
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
  /** Read throughput per second (kB on modern sar, 512-byte sectors on legacy). */
  readSectors: LegacyPointList[];
  /** Write throughput per second (kB on modern sar, 512-byte sectors on legacy). */
  writeSectors: LegacyPointList[];
  avgRqSize: LegacyPointList[];
  avgQueueSize: LegacyPointList[];
  await: LegacyPointList[];
  serviceTime: LegacyPointList[];
  utilPercent: LegacyPointList[];
  /** Unit of the read/write throughput series: 'kB' (modern) or 'sectors' (legacy). */
  throughputUnit: 'kB' | 'sectors' | '';
  /** Whether the source reported a service-time (svctm) column (legacy sar only). */
  hasServiceTime: boolean;
};

/**
 * Port of the legacy `getDevices(key, table, target)`.
 * Splits a DEV-tps style section into per-device series, keyed by device id.
 *
 * Columns are resolved by NAME from the section header rather than by fixed
 * position, so both modern and legacy sysstat layouts map correctly:
 *   - modern  (sar -d):  tps, rkB/s, wkB/s, dkB/s, areq-sz, aqu-sz, await, %util
 *   - legacy  (sar -d):  tps, rd_sec/s, wr_sec/s, avgrq-sz, avgqu-sz, await, svctm, %util
 * A header token at index h corresponds to row field parts[h + 2]
 * (parts[0] = section key, parts[1] = date|time, parts[2] = device id).
 */
export function getDeviceSeries(key: string): DeviceSeries {
  const rows = toRows(key);
  const ids = uniqueIds(key);
  const idIndex: Record<string, number> = {};
  ids.forEach((id, index) => { idIndex[id] = index; });

  const cols = (getHeaders().find((header) => headerSectionKey(header) === key) || '').split(',');
  const dataIndex = (...names: string[]) => {
    for (let i = 0; i < names.length; i += 1) {
      const at = cols.indexOf(names[i]);
      if (at >= 0) return at + 2;
    }
    return -1;
  };

  const tpsIdx = dataIndex('tps');
  const readIdx = dataIndex('rkB/s', 'rd_sec/s');
  const writeIdx = dataIndex('wkB/s', 'wr_sec/s');
  const rqSizeIdx = dataIndex('areq-sz', 'avgrq-sz');
  const queueIdx = dataIndex('aqu-sz', 'avgqu-sz');
  const awaitIdx = dataIndex('await');
  const svctmIdx = dataIndex('svctm');
  const utilIdx = dataIndex('%util');

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
    if (tpsIdx >= 0) tps[deviceIndex].push([timestamp, parseFloat(parts[tpsIdx])]);
    if (readIdx >= 0) readSectors[deviceIndex].push([timestamp, parseFloat(parts[readIdx])]);
    if (writeIdx >= 0) writeSectors[deviceIndex].push([timestamp, parseFloat(parts[writeIdx])]);
    if (rqSizeIdx >= 0) avgRqSize[deviceIndex].push([timestamp, parseFloat(parts[rqSizeIdx])]);
    if (queueIdx >= 0) avgQueueSize[deviceIndex].push([timestamp, parseFloat(parts[queueIdx])]);
    if (awaitIdx >= 0) awaitTime[deviceIndex].push([timestamp, parseFloat(parts[awaitIdx])]);
    if (svctmIdx >= 0) serviceTime[deviceIndex].push([timestamp, parseFloat(parts[svctmIdx])]);
    if (utilIdx >= 0) utilPercent[deviceIndex].push([timestamp, parseFloat(parts[utilIdx])]);
  }

  const throughputUnit: DeviceSeries['throughputUnit'] =
    cols.includes('rkB/s') ? 'kB' : cols.includes('rd_sec/s') ? 'sectors' : '';

  return {
    ids,
    tps,
    readSectors,
    writeSectors,
    avgRqSize,
    avgQueueSize,
    await: awaitTime,
    serviceTime,
    utilPercent,
    throughputUnit,
    hasServiceTime: svctmIdx >= 0
  };
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
  const match = getHeaders().find((header) => header.includes(pattern));
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
