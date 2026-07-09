/**
 * The ranked differential — the dashboard centerpiece. Renders findings most
 * likely first, each with its confidence tier, the rule that fired, the
 * evidence, a capture-time range, and a deep-dive link to the proving chart.
 *
 * When findings is empty it renders the honest empty state: what was checked,
 * over how many samples, and which subsystems the file had no data for (missing
 * data exonerates nothing).
 */
import { useState } from 'preact/hooks';
import { navigateToFinding } from '../lib/findings/findingNav';
import { formatClock, formatDuration } from '../lib/findings/access';
import { overlapsWindow } from '../lib/findings/rank';
import type { Coverage, Finding, IncidentWindow, Subsystem } from '../lib/findings/types';

/** How many findings show before the list is collapsed behind "Show all". */
const COLLAPSED_COUNT = 3;

const TIER_LABEL = { strong: 'Strong signal', moderate: 'Moderate signal', weak: 'Weak signal' } as const;
const SUBSYSTEM_LABEL: Record<Subsystem, string> = {
  cpu: 'CPU', load: 'Load', memory: 'Memory', swap: 'Swap', disk: 'Disk', network: 'Network'
};

function subsystemList(subsystems: Subsystem[]): string {
  const labels = subsystems.map((s) => SUBSYSTEM_LABEL[s].toLowerCase());
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

function FindingCard({ finding, inWindow }: { finding: Finding; inWindow: boolean }) {
  return (
    <div className={`finding-card tier-${finding.tier}`}>
      <div className="finding-main">
        <div className="finding-head">
          <span className={`finding-tier tier-${finding.tier}`}>{TIER_LABEL[finding.tier]}</span>
          <h4 className="finding-title">{finding.title}</h4>
          {inWindow ? <span className="finding-inwindow" title="Overlaps the incident window">in window</span> : null}
        </div>
        <p className="finding-rule">{finding.rule}</p>
        <p className="finding-detail">{finding.detail}</p>
      </div>
      <div className="finding-actions">
        <span className="finding-time num">{formatClock(finding.start)} – {formatClock(finding.end)} · {formatDuration(finding.end - finding.start)}</span>
        <button
          type="button"
          className="finding-link"
          title="Open the chart for this finding"
          onClick={() => { void navigateToFinding(finding); }}
        >
          View chart
          <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </button>
      </div>
    </div>
  );
}

function EmptyState({ coverage }: { coverage: Coverage }) {
  const checked = coverage.present.length ? subsystemList(coverage.present) : 'no subsystems';
  const sampleNote = coverage.sampleCount > 0 ? ` across ${coverage.sampleCount.toLocaleString()} samples` : '';
  return (
    <div className="differential-empty">
      <div className="differential-empty-icon">
        <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
      </div>
      <div>
        <p className="differential-empty-lead">No resource bottleneck signals found.</p>
        <p className="differential-empty-sub">
          Checked {checked}{sampleNote}. Hardware resources do not appear to explain the reported issue.
          {coverage.missing.length ? (
            <> This capture contained no <strong>{subsystemList(coverage.missing)}</strong> data, so those cannot be ruled out from it.</>
          ) : null}
        </p>
      </div>
    </div>
  );
}

export function Differential({ findings, coverage, window: incidentWindow }: {
  findings: Finding[];
  coverage: Coverage;
  window: IncidentWindow | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const collapsible = findings.length > COLLAPSED_COUNT;
  const visible = expanded || !collapsible ? findings : findings.slice(0, COLLAPSED_COUNT);

  return (
    <section className="differential homeContBlock" aria-label="Differential diagnosis">
      <header className="differential-head">
        <span className="differential-head-icon">
          <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l3 7-9 11L3 10z" /><path d="M12 3v18" /></svg>
        </span>
        <h3 className="differential-heading">Differential diagnosis</h3>
        {findings.length ? <span className="differential-count">{findings.length} {findings.length === 1 ? 'finding' : 'findings'}, most likely first</span> : null}
      </header>

      {findings.length === 0 ? (
        <EmptyState coverage={coverage} />
      ) : (
        <>
          <div className="finding-list">
            {visible.map((finding) => (
              <FindingCard
                key={finding.id}
                finding={finding}
                inWindow={!!incidentWindow && overlapsWindow(finding, incidentWindow)}
              />
            ))}
          </div>
          {collapsible ? (
            <button type="button" className="differential-toggle" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'Show fewer' : `Show all ${findings.length} findings`}
              <svg className={`icon${expanded ? ' is-open' : ''}`} viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
