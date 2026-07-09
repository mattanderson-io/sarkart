/**
 * Public entry point for the diagnostic differential engine.
 *
 * `computeFindings` runs every detector over the currently-loaded (and
 * date-filtered) SAR data, ranks the results around an optional incident
 * window, and reports subsystem coverage for the empty state. It is
 * deterministic — same file, same window, same output — with no AI or
 * browser-capability dependency.
 *
 * Consumers (Phase 2 dashboard, Phase 4 PDF) call this and render the result;
 * they never re-derive findings themselves, so every surface agrees.
 */
import { computeCoverage } from './coverage.ts';
import { ALL_DETECTORS } from './detectors.ts';
import { ensureCpuIndex } from './access.ts';
import { rankFindings } from './rank.ts';
import type { FindingsResult, IncidentWindow } from './types.ts';

export type { Coverage, Finding, FindingsResult, FindingTier, IncidentWindow, Subsystem, ChartTarget } from './types.ts';
export { rankFindings, overlapsWindow, distanceToWindow } from './rank.ts';
export { buildTicketSummary } from './ticket.ts';
export { navigateToFinding } from './findingNav.ts';
export { formatClock, formatDuration } from './access.ts';

/**
 * Compute the ranked differential for the loaded file. Async only because the
 * CPU per-core index may need building on first call (a no-op once the
 * dashboard bootstrap has built it).
 */
export async function computeFindings(options: { window?: IncidentWindow } = {}): Promise<FindingsResult> {
  await ensureCpuIndex();

  const findings = ALL_DETECTORS.flatMap((detect) => {
    try {
      return detect();
    } catch (error) {
      // A malformed section for one subsystem must not sink the whole
      // differential — skip that detector and keep the rest.
      console.warn('[SARkart] detector failed:', error);
      return [];
    }
  });

  return {
    findings: rankFindings(findings, options.window),
    coverage: computeCoverage()
  };
}
