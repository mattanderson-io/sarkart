/**
 * The optional "when did the customer's issue happen?" control. Converts a
 * customer-local time (via the two timezone selectors, both defaulting to UTC)
 * into a capture-time window that the differential ranks around, and echoes the
 * conversion so the engineer can see it happened. Also reflects a window set by
 * the timeline brush, whatever its source.
 */
import { useState } from 'preact/hooks';
import {
  PADDING_OPTIONS,
  TIMEZONE_OPTIONS,
  customerLocalToCaptureEpoch,
  setCaptureOffset,
  setCustomerOffset,
  setWindow,
  useIncidentWindow
} from '../lib/incidentWindow';
import { formatClock } from '../lib/findings/access';

/** Parse a datetime-local value ("YYYY-MM-DDTHH:MM") into calendar fields. */
function parseLocalInput(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
    hour: Number(match[4]), minute: Number(match[5])
  };
}

function offsetLabel(offsetMin: number): string {
  return TIMEZONE_OPTIONS.find((o) => o.offsetMin === offsetMin)?.label || 'UTC';
}

export function IncidentWindowControl() {
  const incident = useIncidentWindow();
  const [localValue, setLocalValue] = useState('');
  const [paddingMs, setPaddingMs] = useState(PADDING_OPTIONS[1].ms); // ± 1 hour

  /** Recompute the window from the current form inputs (or clear it). */
  function recompute(value: string, padding: number) {
    const fields = parseLocalInput(value);
    if (!fields) {
      setWindow(null);
      return;
    }
    const center = customerLocalToCaptureEpoch(fields);
    setWindow({ start: center - padding, end: center + padding });
  }

  const onTimeInput = (event: Event) => {
    const value = (event.target as HTMLInputElement).value;
    setLocalValue(value);
    recompute(value, paddingMs);
  };

  const onPadding = (event: Event) => {
    const ms = Number((event.target as HTMLSelectElement).value);
    setPaddingMs(ms);
    recompute(localValue, ms);
  };

  const onCustomerTz = (event: Event) => {
    setCustomerOffset(Number((event.target as HTMLSelectElement).value));
    recompute(localValue, paddingMs);
  };

  const onCaptureTz = (event: Event) => {
    setCaptureOffset(Number((event.target as HTMLSelectElement).value));
    recompute(localValue, paddingMs);
  };

  const clear = () => {
    setLocalValue('');
    setWindow(null);
  };

  const converted = parseLocalInput(localValue);

  return (
    <section className="incident-control homeContBlock" aria-label="Incident window">
      <div className="incident-row">
        <label className="incident-field">
          <span className="incident-label">Incident time <span className="incident-optional">(optional)</span></span>
          <input type="datetime-local" className="incident-input num" value={localValue} onInput={onTimeInput} />
        </label>

        <label className="incident-field">
          <span className="incident-label">Customer timezone</span>
          <select className="select-control" value={incident.customerOffsetMin} onChange={onCustomerTz}>
            {TIMEZONE_OPTIONS.map((o) => <option value={o.offsetMin}>{o.label}</option>)}
          </select>
        </label>

        <label className="incident-field">
          <span className="incident-label">Capture timezone</span>
          <select className="select-control" value={incident.captureOffsetMin} onChange={onCaptureTz}>
            {TIMEZONE_OPTIONS.map((o) => <option value={o.offsetMin}>{o.label}</option>)}
          </select>
        </label>

        <label className="incident-field">
          <span className="incident-label">Window</span>
          <select className="select-control" value={paddingMs} onChange={onPadding}>
            {PADDING_OPTIONS.map((o) => <option value={o.ms}>{o.label}</option>)}
          </select>
        </label>

        {incident.window ? (
          <button type="button" className="incident-clear" onClick={clear} title="Clear incident window">Clear</button>
        ) : null}
      </div>

      {incident.window ? (
        <p className="incident-echo num">
          {converted
            ? <>Ranking around {converted.hour.toString().padStart(2, '0')}:{converted.minute.toString().padStart(2, '0')} {offsetLabel(incident.customerOffsetMin)} → </>
            : <>Active window (capture time): </>}
          <strong>{formatClock(incident.window.start)} – {formatClock(incident.window.end)}</strong>
          {incident.captureOffsetMin === 0 ? ' UTC' : ` ${offsetLabel(incident.captureOffsetMin)}`} (capture time)
        </p>
      ) : (
        <p className="incident-hint">Set the reported incident time to rank findings by proximity — out-of-window findings stay listed, just lower.</p>
      )}
    </section>
  );
}
