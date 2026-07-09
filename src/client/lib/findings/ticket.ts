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
  if (finding.tier === 'strong') return 'high confidence';
  if (finding.tier === 'moderate') return 'possible';
  return 'low confidence';
}

function subsystemList(subsystems: Subsystem[]): string {
  const labels = subsystems.map((s) => SUBSYSTEM_LABEL[s]);
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

function list(items: string[]): string {
  const unique = Array.from(new Set(items.filter(Boolean)));
  if (unique.length <= 1) return unique.join('');
  return `${unique.slice(0, -1).join(', ')} and ${unique[unique.length - 1]}`;
}

function lowerFirst(text: string): string {
  return text ? text[0].toLowerCase() + text.slice(1) : text;
}

function firstSentence(text: string): string {
  const sentence = text.match(/^.*?\.(?:\s|$)/)?.[0]?.trim();
  return sentence || text.trim();
}

function findingWindow(finding: Finding): string {
  return `${formatClock(finding.start)} to ${formatClock(finding.end)}`;
}

function resourceName(finding: Finding): string {
  const target = finding.chartTarget;
  if (target.kind === 'device') return target.deviceId;
  if (target.kind === 'interfaceError') return target.interfaceId;
  if (target.kind === 'cpu') return target.coreId === 'all' ? 'all CPUs' : `CPU ${target.coreId}`;
  return '';
}

function groupedTitle(finding: Finding): string {
  if (finding.subsystem === 'network') return 'network errors or packet drops';
  if (finding.subsystem === 'disk') return 'storage delays';
  if (finding.metric === 'swap') return 'memory pressure';
  if (finding.metric === '%iowait') return 'storage-related CPU wait';
  if (finding.metric === '%steal') return 'virtualization host contention';
  if (finding.subsystem === 'load') return 'system load';
  return lowerFirst(finding.title);
}

function groupKey(finding: Finding): string {
  return `${finding.subsystem}:${finding.metric}`;
}

function supportingPhrase(group: Finding[]): string {
  const first = group[0];
  const resources = list(group.map(resourceName));
  const windows = group.slice(0, 3).map(findingWindow);
  const more = group.length > windows.length ? `, plus ${group.length - windows.length} more` : '';
  const where = resources ? ` on ${resources}` : '';
  const count = group.length > 1 ? `${group.length} periods of ${groupedTitle(first)}` : groupedTitle(first);
  return `${count}${where}, seen ${windows.join(', ')}${more} (${tierPhrase(first)}).`;
}

function plainEvidence(finding: Finding): string {
  if (finding.metric === 'swap') {
    return 'The server was using swap, which usually means the active workload did not fit comfortably in memory.';
  }
  if (finding.subsystem === 'network') {
    return 'The network interface reported errors or dropped packets, which can cause retries, slow responses, or intermittent failures.';
  }
  if (finding.subsystem === 'disk' || finding.metric === '%iowait') {
    return 'Storage was slow enough that work had to wait on disk I/O.';
  }
  if (finding.metric === '%steal') {
    return 'The virtual machine was waiting for CPU time from the underlying host.';
  }
  if (finding.subsystem === 'load') {
    return 'More work was queued than the available CPU capacity could comfortably handle.';
  }
  return firstSentence(finding.detail);
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

  const primary = findings[0];
  const primaryDuration = formatDuration(primary.end - primary.start);
  const relatedPrimary = findings
    .slice(1)
    .filter((f) => groupKey(f) === groupKey(primary));
  const otherGroups = new Map<string, Finding[]>();
  for (const finding of findings.slice(1).filter((f) => groupKey(f) !== groupKey(primary))) {
    const key = groupKey(finding);
    const group = otherGroups.get(key);
    if (group) group.push(finding);
    else otherGroups.set(key, [finding]);
  }

  const primaryMore = relatedPrimary.length
    ? ` There ${relatedPrimary.length === 1 ? 'was' : 'were'} ${relatedPrimary.length} additional `
      + `${groupedTitle(primary)} ${relatedPrimary.length === 1 ? 'period' : 'periods'}: `
      + `${relatedPrimary.slice(0, 3).map(findingWindow).join(', ')}`
      + `${relatedPrimary.length > 3 ? `, plus ${relatedPrimary.length - 3} more` : ''}.`
    : '';

  const supporting = Array.from(otherGroups.values()).slice(0, 3).map(supportingPhrase);
  const supportingText = supporting.length
    ? `\n\nOther items worth checking:\n${supporting.map((s) => `- ${s}`).join('\n')}`
    : '';

  const missing = coverage.missing.length
    ? `\n\nNote: this SAR capture did not include ${subsystemList(coverage.missing)} data, so those areas were not assessed.`
    : '';

  return `SAR analysis of ${host} found ${findings.length} `
    + `${findings.length === 1 ? 'notable signal' : 'notable signals'}${sampleNote}.`
    + `\n\nPrimary concern: ${lowerFirst(groupedTitle(primary))} from ${findingWindow(primary)} `
    + `(${primaryDuration}, ${tierPhrase(primary)}). ${plainEvidence(primary)}`
    + primaryMore
    + supportingText
    + '\n\nRecommendation: compare these time windows with the reported incident time, then review the matching detailed charts before deciding on remediation.'
    + missing;
}
