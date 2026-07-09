/**
 * Ordering for the differential.
 *
 * Decisions (see `docs/dashboard-redesign-plan.md`):
 *  - When an incident window is set, findings overlapping it rank above those
 *    outside it — but out-of-window findings are DEMOTED, never hidden (the
 *    safety net for a wrong customer timestamp / timezone).
 *  - Out-of-window findings are ordered by proximity to the window, so the
 *    nearest miss surfaces first.
 *  - Within a partition, stronger tiers rank first, then higher severity.
 */
import type { Finding, FindingTier, IncidentWindow } from './types.ts';

const TIER_RANK: Record<FindingTier, number> = { strong: 3, moderate: 2, weak: 1 };

/** Does the finding's interval overlap the incident window at all? */
export function overlapsWindow(finding: Finding, window: IncidentWindow): boolean {
  return finding.start <= window.end && finding.end >= window.start;
}

/** Distance in ms from the finding's interval to the window (0 if overlapping). */
export function distanceToWindow(finding: Finding, window: IncidentWindow): number {
  if (overlapsWindow(finding, window)) return 0;
  if (finding.end < window.start) return window.start - finding.end;
  return finding.start - window.end;
}

/** Compare by tier (desc) then severity (desc). */
function byStrength(a: Finding, b: Finding): number {
  const tier = TIER_RANK[b.tier] - TIER_RANK[a.tier];
  if (tier !== 0) return tier;
  return b.severity - a.severity;
}

/**
 * Rank findings for display. Returns a new sorted array; does not mutate input.
 * Without a window, purely by strength. With a window: in-window findings first
 * (by strength), then out-of-window (by proximity, then strength).
 */
export function rankFindings(findings: Finding[], window?: IncidentWindow): Finding[] {
  const sorted = findings.slice();
  if (!window) {
    return sorted.sort(byStrength);
  }

  return sorted.sort((a, b) => {
    const aIn = overlapsWindow(a, window);
    const bIn = overlapsWindow(b, window);
    if (aIn !== bIn) return aIn ? -1 : 1;
    if (!aIn) {
      const prox = distanceToWindow(a, window) - distanceToWindow(b, window);
      if (prox !== 0) return prox;
    }
    return byStrength(a, b);
  });
}
