/**
 * Builds the compact per-subsystem overview series for the dashboard timeline
 * strip — one representative metric per subsystem on a shared time axis, so an
 * engineer can eyeball the whole capture for trouble and visually find the
 * incident window. Reads the store through `access.ts`; returns only the
 * subsystems the file actually has data for.
 */
// LegacyPoint (`[timestamp, value]`) is an ambient global from types/legacy.d.ts.
import { getDeviceSeries, getInterfaceErrorSeries, headerSectionKey } from '../sarData.ts';
import { cpuAllSeries, genericSeries, headerByFirstToken, headerByFirstTokenWithColumn } from './access.ts';
import type { Subsystem } from './types.ts';

export type TimelineRow = {
  subsystem: Subsystem;
  label: string;
  unit: string;
  points: LegacyPoint[];
};

/** Per-timestamp max across several index-aligned series (e.g. busiest disk). */
function maxByIndex(series: LegacyPoint[][]): LegacyPoint[] {
  const base = series.find((s) => s.length) || [];
  return base.map((_, i) => {
    let peak = 0;
    let ts = base[i][0];
    for (const s of series) {
      const v = s[i]?.[1];
      if (v != null && Number.isFinite(v) && v > peak) peak = v;
      if (s[i]) ts = s[i][0];
    }
    return [ts, peak] as LegacyPoint;
  });
}

/** Per-timestamp sum across several index-aligned series. */
function sumByIndex(series: LegacyPoint[][]): LegacyPoint[] {
  const base = series.find((s) => s.length) || [];
  return base.map((_, i) => {
    let sum = 0;
    for (const s of series) {
      const v = s[i]?.[1];
      if (v != null && Number.isFinite(v)) sum += v;
    }
    return [base[i][0], sum] as LegacyPoint;
  });
}

export function buildTimelineRows(): TimelineRow[] {
  const rows: TimelineRow[] = [];

  const cpu = cpuAllSeries('%usr');
  if (cpu.length) rows.push({ subsystem: 'cpu', label: 'CPU %usr', unit: '%', points: cpu });

  const load = genericSeries('runq-sz', 'ldavg-5');
  if (load) rows.push({ subsystem: 'load', label: 'Load (5m)', unit: '', points: load.points });

  const swapIn = genericSeries('pswpin/s', 'pswpin/s');
  const swapOut = genericSeries('pswpin/s', 'pswpout/s');
  if (swapIn) {
    rows.push({
      subsystem: 'memory', label: 'Swap activity', unit: ' pg/s',
      points: sumByIndex([swapIn.points, swapOut?.points || []])
    });
  }

  const devHeader = headerByFirstToken('DEV');
  if (devHeader) {
    const dev = getDeviceSeries(headerSectionKey(devHeader));
    if (dev.utilPercent.some((s) => s.length)) {
      rows.push({ subsystem: 'disk', label: 'Busiest disk %util', unit: '%', points: maxByIndex(dev.utilPercent) });
    }
  }

  const errHeader = headerByFirstTokenWithColumn('IFACE', 'rxerr/s');
  if (errHeader) {
    const err = getInterfaceErrorSeries(headerSectionKey(errHeader));
    const combined = err.ids.map((_, i) => sumByIndex([
      err.rxerr[i] || [], err.txerr[i] || [], err.coll[i] || [], err.rxdrop[i] || [], err.txdrop[i] || []
    ]));
    const total = sumByIndex(combined);
    if (total.some(([, v]) => (v || 0) > 0)) {
      rows.push({ subsystem: 'network', label: 'Net errors', unit: '/s', points: total });
    }
  }

  return rows;
}
