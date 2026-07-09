/**
 * Which subsystems the file actually contained data for. Powers the honest
 * empty state: a `sar` capture taken without disk stats cannot exonerate the
 * disk, so "no findings" must be paired with "here's what we could and could
 * not check". Missing data is never reported as healthy.
 */
import { grepHeader } from '../sarData.ts';
import { cpuAllSeries, genericSeries, headerByFirstToken, headerByFirstTokenWithColumn } from './access.ts';
import type { Coverage, Subsystem } from './types.ts';

/** Presence probe per subsystem: is the section that feeds its detector present? */
const PROBES: Array<{ subsystem: Subsystem; present: () => boolean }> = [
  { subsystem: 'cpu', present: () => grepHeader('%iowait') !== null },
  { subsystem: 'load', present: () => grepHeader('runq-sz') !== null },
  { subsystem: 'memory', present: () => grepHeader('kbmemfree') !== null },
  { subsystem: 'swap', present: () => grepHeader('pswpin/s') !== null || grepHeader('kbswpfree') !== null },
  { subsystem: 'disk', present: () => headerByFirstToken('DEV') !== null },
  { subsystem: 'network', present: () => headerByFirstTokenWithColumn('IFACE', 'rxerr/s') !== null }
];

/**
 * Number of samples in the primary series, for the "checked across N samples"
 * message. Prefers the CPU all-core series (present in nearly every capture),
 * falling back to the load series. Assumes the CPU index is built (the
 * orchestrator ensures this before calling).
 */
function primarySampleCount(): number {
  const cpu = cpuAllSeries('%iowait');
  if (cpu.length) return cpu.length;
  const load = genericSeries('runq-sz', 'ldavg-5');
  return load ? load.points.length : 0;
}

export function computeCoverage(): Coverage {
  const present: Subsystem[] = [];
  const missing: Subsystem[] = [];
  for (const probe of PROBES) {
    (probe.present() ? present : missing).push(probe.subsystem);
  }
  return { present, missing, sampleCount: primarySampleCount() };
}
