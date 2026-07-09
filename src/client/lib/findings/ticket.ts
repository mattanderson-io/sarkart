/**
 * Deterministic ticket-ready prose rendered FROM the findings — the copy-paste
 * paragraph a support engineer drops into a customer update. Pure and
 * template-based (no AI, no browser capability), so the same file yields the
 * same text every time, and it can never contradict the differential list it is
 * generated from. Shared by the dashboard (Phase 2) and the PDF cover (Phase 4).
 */
import { formatClock, formatDuration } from './access.ts';
import type { Coverage, Finding, Subsystem } from './types.ts';

const SUBSYSTEM_LABEL: Record<Subsystem, string> = {
  cpu: 'CPU',
  load: 'load',
  memory: 'memory',
  swap: 'swap',
  disk: 'disk',
  network: 'network'
};

function tierPhrase(finding: Finding): string {
  if (finding.tier === 'strong') return 'most likely';
  if (finding.tier === 'moderate') return 'possible';
  return 'a weak signal';
}

function subsystemList(subsystems: Subsystem[]): string {
  const labels = subsystems.map((s) => SUBSYSTEM_LABEL[s]);
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/**
 * Build the ticket summary. `hostname`/`os` come from the caller (the store),
 * keeping this module free of DOM/store coupling so it stays unit-testable.
 */
export function buildTicketSummary(
  findings: Finding[],
  coverage: Coverage,
  meta: { hostname: string; os: string }
): string {
  const host = meta.hostname || 'the server';
  const sampleNote = coverage.sampleCount > 0 ? ` across ${coverage.sampleCount} samples` : '';

  if (findings.length === 0) {
    const checked = coverage.present.length
      ? `Checked ${subsystemList(coverage.present)}${sampleNote}.`
      : '';
    const missing = coverage.missing.length
      ? ` This capture contained no ${subsystemList(coverage.missing)} data, so those cannot be ruled out from it.`
      : '';
    return `SAR analysis of ${host} found no resource bottleneck signals. ${checked}`.trim()
      + ' Hardware resources do not appear to explain the reported issue.' + missing;
  }

  const lines = findings.slice(0, 5).map((f, i) => {
    const lead = i === 0 ? 'The most likely contributor is' : 'Also observed';
    return `${lead} ${f.title.toLowerCase()} (${tierPhrase(f)}): ${f.rule}, `
      + `from ${formatClock(f.start)} to ${formatClock(f.end)} (${formatDuration(f.end - f.start)}).`;
  });

  const missing = coverage.missing.length
    ? ` Note: this capture contained no ${subsystemList(coverage.missing)} data.`
    : '';

  return `SAR analysis of ${host} surfaced ${findings.length} `
    + `${findings.length === 1 ? 'signal' : 'signals'}${sampleNote}, most likely first. `
    + lines.join(' ') + missing;
}
