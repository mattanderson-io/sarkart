/**
 * Ticket-ready prose, generated deterministically from the findings (never AI),
 * with a copy button — the support engineer's final act is pasting this into a
 * customer update. Because it renders from the same findings the differential
 * shows, the two can never disagree.
 */
import { useState } from 'preact/hooks';
import { buildTicketSummary } from '../lib/findings/ticket';
import { getHostname, getOS } from '../lib/sarEngine';
import type { Coverage, Finding } from '../lib/findings/types';

export function TicketSummary({ findings, coverage }: { findings: Finding[]; coverage: Coverage }) {
  const [copied, setCopied] = useState(false);
  const text = buildTicketSummary(findings, coverage, { hostname: getHostname(), os: getOS() });

  const copy = () => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <section className="ticket-summary homeContBlock" aria-label="Ticket summary">
      <header className="ticket-head">
        <span className="ticket-title">Ticket summary</span>
        <button type="button" className="ticket-copy" onClick={copy} title="Copy summary to clipboard">
          {copied ? (
            <><svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>Copied</>
          ) : (
            <><svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>Copy</>
          )}
        </button>
      </header>
      <div className="ticket-text">{text}</div>
    </section>
  );
}
