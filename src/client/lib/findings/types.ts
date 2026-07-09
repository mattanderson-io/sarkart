/**
 * Shared types for the diagnostic differential engine.
 *
 * The engine turns a parsed SAR file into a ranked list of plausible resource
 * bottlenecks ("findings"), each tied to a time range and the chart that proves
 * it. See `docs/dashboard-redesign-plan.md` for the product rationale and
 * `docs/heuristics.md` for the rules behind each finding.
 */

/** The resource classes the differential reasons about. */
export type Subsystem = 'cpu' | 'load' | 'memory' | 'swap' | 'disk' | 'network';

/**
 * Confidence tier for a finding. Deliberately qualitative, not numeric — we
 * have no ground-truth calibration, so a "87% likely" would be false precision.
 * Boundaries are set conservatively: when a run is ambiguous it rounds *down*
 * (an inflated "Strong" costs more trust than an overcautious "Moderate").
 */
export type FindingTier = 'strong' | 'moderate' | 'weak';

/**
 * Where a finding's "deep dive" link should land. Consumed in Phase 3
 * (`findingNav.ts`) to open the most specific chart page zoomed to the finding's
 * window. Kept structured (not a URL) so navigation logic stays in one place.
 */
export type ChartTarget =
  | { kind: 'cpu'; coreId: string }
  | { kind: 'sidebar'; buttonId: string }
  | { kind: 'device'; deviceId: string }
  | { kind: 'interfaceError'; interfaceId: string };

/** A single detected bottleneck signal. */
export type Finding = {
  /** Stable id (subsystem + metric + optional resource id + start), for keys. */
  id: string;
  subsystem: Subsystem;
  /** Short headline, e.g. "Disk I/O saturation on sdb". */
  title: string;
  /** The documented rule that fired, e.g. "%util above 90% for 32 min". */
  rule: string;
  /** Evidence sentence with concrete numbers, for the differential + prose. */
  detail: string;
  /** Interval start/end as epoch ms in capture (file) time. */
  start: number;
  end: number;
  /** Peak value observed during the interval, and its unit/metric for display. */
  peakValue: number;
  unit: string;
  metric: string;
  tier: FindingTier;
  /**
   * Normalized 0..1 signal strength, blending exceedance magnitude and
   * duration. Only used to order findings *within* a tier — cross-tier order is
   * decided by the tier itself. Not shown to the user.
   */
  severity: number;
  chartTarget: ChartTarget;
};

/** An incident window (epoch ms, capture time) the differential ranks around. */
export type IncidentWindow = { start: number; end: number };

/**
 * Which subsystems the file did and did not contain data for. Drives the honest
 * empty state: "checked X, Y, Z" and "no data in file for: A" (missing data
 * exonerates nothing).
 */
export type Coverage = {
  present: Subsystem[];
  missing: Subsystem[];
  /** Number of samples in the primary (CPU-all, else Load) series. */
  sampleCount: number;
};

export type FindingsResult = {
  findings: Finding[];
  coverage: Coverage;
};
