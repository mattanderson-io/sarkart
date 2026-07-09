/**
 * Shared state for the dashboard's incident window — the optional "when did the
 * customer's issue happen?" the differential ranks around.
 *
 * A module-level store (the app has no signals library) with a subscribe hook,
 * so the incident-window control, the timeline strip's brush, and the
 * differential all read/write one source of truth.
 *
 * Timezone model (see `docs/dashboard-redesign-plan.md`): the window is stored
 * in CAPTURE time — the same epoch space as every SAR timestamp, which
 * `sarData.toTimestamp` builds by treating the file's wall clock as UTC. Capture
 * time is the single display truth. The customer-timezone selector only converts
 * the value the user types on its way in; nothing else on the page shifts zone.
 */
import { useEffect, useState } from 'preact/hooks';

export type TimeZoneOption = { label: string; offsetMin: number };

/**
 * Offset-based zone list. Deliberately offsets, not names like "EST": captures
 * are reliably UTC (so the default is correct), this control exists only for
 * exceptions, and an explicit offset sidesteps the DST ambiguity of zone names.
 */
export const TIMEZONE_OPTIONS: TimeZoneOption[] = [
  { label: 'UTC', offsetMin: 0 },
  { label: 'UTC−12:00', offsetMin: -720 },
  { label: 'UTC−11:00', offsetMin: -660 },
  { label: 'UTC−10:00', offsetMin: -600 },
  { label: 'UTC−09:00', offsetMin: -540 },
  { label: 'UTC−08:00', offsetMin: -480 },
  { label: 'UTC−07:00', offsetMin: -420 },
  { label: 'UTC−06:00', offsetMin: -360 },
  { label: 'UTC−05:00', offsetMin: -300 },
  { label: 'UTC−04:00', offsetMin: -240 },
  { label: 'UTC−03:00', offsetMin: -180 },
  { label: 'UTC−02:00', offsetMin: -120 },
  { label: 'UTC−01:00', offsetMin: -60 },
  { label: 'UTC+01:00', offsetMin: 60 },
  { label: 'UTC+02:00', offsetMin: 120 },
  { label: 'UTC+03:00', offsetMin: 180 },
  { label: 'UTC+04:00', offsetMin: 240 },
  { label: 'UTC+05:00', offsetMin: 300 },
  { label: 'UTC+05:30', offsetMin: 330 },
  { label: 'UTC+06:00', offsetMin: 360 },
  { label: 'UTC+07:00', offsetMin: 420 },
  { label: 'UTC+08:00', offsetMin: 480 },
  { label: 'UTC+09:00', offsetMin: 540 },
  { label: 'UTC+10:00', offsetMin: 600 },
  { label: 'UTC+11:00', offsetMin: 660 },
  { label: 'UTC+12:00', offsetMin: 720 }
];

/** Half-width choices for the window around the incident instant. */
export const PADDING_OPTIONS: Array<{ label: string; ms: number }> = [
  { label: '± 30 min', ms: 30 * 60_000 },
  { label: '± 1 hour', ms: 60 * 60_000 },
  { label: '± 2 hours', ms: 120 * 60_000 },
  { label: '± 4 hours', ms: 240 * 60_000 }
];

export type IncidentState = {
  /** Active window in capture epoch ms, or null when unset. */
  window: { start: number; end: number } | null;
  /** Timezone the SAR file's clock is in (default UTC). */
  captureOffsetMin: number;
  /** Timezone the customer reported their time in (default UTC). */
  customerOffsetMin: number;
};

const state: IncidentState = {
  window: null,
  captureOffsetMin: 0,
  customerOffsetMin: 0
};

const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function getIncidentState(): IncidentState {
  return state;
}

/**
 * Convert a customer-local wall-clock instant (from a datetime-local field, no
 * zone of its own) to a capture-time epoch. The real UTC instant is
 * `customerLocal − customerOffset`; the capture wall clock is that plus the
 * capture offset; our epoch treats capture wall clock as UTC. Net shift is
 * `captureOffset − customerOffset` — zero when both default to UTC.
 */
export function customerLocalToCaptureEpoch(fields: {
  year: number; month: number; day: number; hour: number; minute: number;
}): number {
  const asUtc = Date.UTC(fields.year, fields.month - 1, fields.day, fields.hour, fields.minute, 0);
  return asUtc + (state.captureOffsetMin - state.customerOffsetMin) * 60_000;
}

/** Set the window directly in capture epoch (used by the timeline brush). */
export function setWindow(window: { start: number; end: number } | null) {
  state.window = window;
  emit();
}

export function setCaptureOffset(offsetMin: number) {
  state.captureOffsetMin = offsetMin;
  emit();
}

export function setCustomerOffset(offsetMin: number) {
  state.customerOffsetMin = offsetMin;
  emit();
}

/** Subscribe a Preact component to the incident state. */
export function useIncidentWindow(): IncidentState {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return state;
}
