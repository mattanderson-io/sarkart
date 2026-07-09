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
  if (finding.tier === 'strong') return 'strong';
  if (finding.tier === 'moderate') return 'moderate';
  return 'weak';
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
  return `${formatClock(finding.start)}-${formatClock(finding.end)}`;
}

function resourceName(finding: Finding): string {
  const target = finding.chartTarget;
  if (target.kind === 'device') return target.deviceId;
  if (target.kind === 'interfaceError') return target.interfaceId;
  if (target.kind === 'cpu') return target.coreId === 'all' ? 'all CPUs' : `CPU ${target.coreId}`;
  return '';
}

function groupedTitle(finding: Finding): string {
  if (finding.subsystem === 'network') return 'network errors';
  if (finding.subsystem === 'disk') return 'disk I/O saturation';
  if (finding.metric === 'swap') return 'swap activity';
  if (finding.metric === '%iowait') return 'CPU I/O wait';
  if (finding.metric === '%steal') return 'CPU steal';
  if (finding.subsystem === 'load') return 'high load';
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
  const count = group.length > 1 ? `${group.length} ${groupedTitle(first)} windows` : groupedTitle(first);
  return `${count}${where} (${tierPhrase(first)} evidence; ${windows.join(', ')}${more})`;
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
      + `${groupedTitle(primary)} ${relatedPrimary.length === 1 ? 'window' : 'windows'}: `
      + `${relatedPrimary.slice(0, 3).map(findingWindow).join(', ')}`
      + `${relatedPrimary.length > 3 ? `, plus ${relatedPrimary.length - 3} more` : ''}.`
    : '';

  const supporting = Array.from(otherGroups.values()).slice(0, 3).map(supportingPhrase);
  const supportingText = supporting.length
    ? ` Supporting signals: ${supporting.join('; ')}.`
    : '';

  const missing = coverage.missing.length
    ? ` Note: this capture contained no ${subsystemList(coverage.missing)} data.`
    : '';

  return `SAR analysis of ${host} found ${findings.length} `
    + `${findings.length === 1 ? 'signal' : 'signals'}${sampleNote}. `
    + `The strongest evidence points to ${lowerFirst(primary.title)} from ${findingWindow(primary)} `
    + `(${primaryDuration}, ${tierPhrase(primary)} evidence). ${firstSentence(primary.detail)}`
    + primaryMore
    + supportingText
    + ' Use the reported incident time to decide which of these windows is most relevant.'
    + missing;
}
