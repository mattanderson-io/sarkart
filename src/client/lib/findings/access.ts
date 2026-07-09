/**
 * Store-facing helpers for the detectors: resolve section keys/columns by name,
 * pull `[ts, value]` series through the existing tested getters, count CPU
 * cores, and format capture-time timestamps.
 *
 * Detectors depend on this module (not on `sarStore`/`sarData` directly) so all
 * the "how is this metric stored" knowledge stays in one place.
 */
import { buildCpuByCore } from '../cpuIndex.ts';
// LegacyPoint (`[timestamp, value]`) is an ambient global from types/legacy.d.ts.
import {
  getCPU,
  getGenericData,
  grepHeader,
  headerColumnIndex,
  headerSectionKey
} from '../sarData.ts';
import { getCpuByCore, getFirstLine, getHeaders, getRows, setCpuByCore } from '../sarStore.ts';

/** The header line whose first comma-token equals `token` (e.g. "DEV", "IFACE"). */
export function headerByFirstToken(token: string): string | null {
  return getHeaders().find((h) => h.split(',')[0] === token) ?? null;
}

/**
 * The header whose first token is `token` AND that contains `columnName` — used
 * to pick one of several same-prefixed sections (e.g. the IFACE *errors* section
 * carries "rxerr/s", the traffic one does not).
 */
export function headerByFirstTokenWithColumn(token: string, columnName: string): string | null {
  return getHeaders().find((h) => h.split(',')[0] === token && h.includes(columnName)) ?? null;
}

/** The CPU section header (the one carrying the per-core utilization columns). */
export function cpuHeader(): string | null {
  return grepHeader('%iowait');
}

/** The CPU section key, e.g. "CPU-%usr". */
export function cpuSectionKey(): string | null {
  const header = cpuHeader();
  return header ? headerSectionKey(header) : null;
}

/**
 * Ensure the per-core CPU index `getCPU` reads is populated. At runtime the
 * dashboard bootstrap already built it, so this is a no-op; in tests/headless
 * use it builds the index once from the CPU section using the canonical builder.
 */
export async function ensureCpuIndex(): Promise<void> {
  if (Object.keys(getCpuByCore()).length > 0) return;
  const key = cpuSectionKey();
  if (!key) return;
  const { byCore } = await buildCpuByCore(getRows(key));
  setCpuByCore(byCore);
}

/** The CPU "all"-core series for a named column (e.g. "%iowait"), or []. */
export function cpuAllSeries(columnName: string): LegacyPoint[] {
  const header = cpuHeader();
  if (!header) return [];
  return getCPU('all', headerColumnIndex(header, columnName));
}

/**
 * A generic (id-less) section's series for a named column. `pattern` locates the
 * section header (e.g. "runq-sz"), `columnName` the column (e.g. "ldavg-5").
 * Returns the series plus the resolved section key, or null when absent.
 */
export function genericSeries(
  pattern: string,
  columnName: string
): { points: LegacyPoint[]; sectionKey: string } | null {
  const header = grepHeader(pattern);
  if (!header) return null;
  const sectionKey = headerSectionKey(header);
  return { points: getGenericData(sectionKey, headerColumnIndex(header, columnName)), sectionKey };
}

/**
 * CPU core count. Prefers the "(N CPU)" tag on the SAR file's first line (the
 * server's own report), falling back to the number of distinct per-core rows.
 * Replaces the old DOM-node count in `sarStats.cpuCount()`, which needed the
 * rendered sidebar and so didn't work headless.
 */
export function coreCount(): number {
  // firstLine may be raw ("(64 CPU)") or comma-joined by the parser
  // ("(64,CPU)"), so tolerate whitespace or commas between the count and "CPU".
  const match = getFirstLine().match(/\((\d+)[\s,]*CPU\)/i);
  if (match) {
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const key = cpuSectionKey();
  if (key) {
    const cores = new Set<string>();
    for (const row of getRows(key)) {
      const id = row.split(',')[2];
      if (id && id !== 'all') cores.add(id);
    }
    if (cores.size) return cores.size;
  }
  return 1;
}

// -- Capture-time formatting -------------------------------------------------
//
// Timestamps are built with Date.UTC(...) from the file's wall-clock (see
// sarData.toTimestamp), so the file's local time is recovered by formatting the
// epoch in UTC. Capture time is the single display truth across the dashboard.

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "MM/DD HH:MM" in capture (file) time. */
export function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Human duration: "9 min", "32 min", "1 h 05 min". */
export function formatDuration(ms: number): string {
  const totalMin = Math.max(1, Math.round(ms / 60_000));
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h} h ${pad(m)} min`;
}
