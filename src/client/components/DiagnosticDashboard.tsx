/**
 * The diagnostic dashboard — the replacement for the peak KPI cards + AI
 * summary. Composes the incident-window control, the ranked differential, the
 * timeline strip, and the ticket summary.
 *
 * Findings are computed once per data change (initial load or date-filter
 * refresh, signaled by `sarkart:data-ready`) and re-ranked cheaply whenever the
 * incident window changes — detectors don't re-run for a re-sort.
 *
 * Visibility follows the same `body.is-dashboard` rule as the old dashboard
 * (see CSS); the component also renders nothing until data is ready, so it stays
 * empty on the landing screen.
 */
import { useEffect, useMemo, useState } from 'preact/hooks';
import { computeFindings, rankFindings, type FindingsResult } from '../lib/findings';
import { hasData } from '../lib/sarStore';
import { useIncidentWindow } from '../lib/incidentWindow';
import { Differential } from './Differential';
import { IncidentWindowControl } from './IncidentWindowControl';
import { TicketSummary } from './TicketSummary';
import { TimelineStrip } from './TimelineStrip';

export function DiagnosticDashboard() {
  const [result, setResult] = useState<FindingsResult | null>(null);
  const incident = useIncidentWindow();

  useEffect(() => {
    let cancelled = false;
    const recompute = () => {
      computeFindings().then((res) => { if (!cancelled) setResult(res); }).catch((error) => {
        console.error('[SARkart] findings computation failed:', error);
      });
    };

    if (hasData()) recompute();
    window.addEventListener('sarkart:data-ready', recompute);
    return () => {
      cancelled = true;
      window.removeEventListener('sarkart:data-ready', recompute);
    };
  }, []);

  const ranked = useMemo(
    () => (result ? rankFindings(result.findings, incident.window ?? undefined) : []),
    [result, incident.window]
  );

  if (!result) return null;

  return (
    <div id="diagnosticDashboard" className="diagnostic-dashboard">
      <IncidentWindowControl />
      <Differential findings={ranked} coverage={result.coverage} window={incident.window} />
      <TimelineStrip findings={ranked} />
      <TicketSummary findings={ranked} coverage={result.coverage} />
    </div>
  );
}
