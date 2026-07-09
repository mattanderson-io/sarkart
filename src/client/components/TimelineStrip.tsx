/**
 * The all-subsystems timeline strip: one compact row per subsystem on a shared
 * time axis, so the engineer can scan the whole capture at once. Finding
 * intervals are highlighted on their rows; the active incident window is shaded
 * across all rows. Dragging a horizontal selection sets the incident window
 * (an alternative to typing it into the control above).
 *
 * Rendered imperatively with the global Plotly (same engine as every other
 * chart). If Plotly or data is missing it renders nothing.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { buildTimelineRows, type TimelineRow } from '../lib/findings/timeline';
import { chartTheme } from '../lib/chartTheme';
import { setWindow, useIncidentWindow } from '../lib/incidentWindow';
import type { Finding, IncidentWindow, Subsystem } from '../lib/findings/types';

const SUBSYSTEM_COLOR: Record<Subsystem, string> = {
  cpu: '#00ADEF', load: '#119944', memory: '#F1912E', swap: '#F1912E', disk: '#cc6699', network: '#8085e9'
};

const ROW_HEIGHT = 46;
const ROW_GAP = 0.04;
const ROW_LABEL_BAND = 0.24;

function findingShapes(findings: Finding[], rowIndex: Record<Subsystem, number>): Record<string, unknown>[] {
  const shapes: Record<string, unknown>[] = [];
  for (const f of findings) {
    const idx = rowIndex[f.subsystem];
    if (idx === undefined) continue;
    const yref = idx === 0 ? 'y' : `y${idx + 1}`;
    shapes.push({
      type: 'rect', xref: 'x', yref: `${yref} domain`,
      x0: f.start, x1: f.end === f.start ? f.start + 60_000 : f.end, y0: 0, y1: 1,
      fillcolor: f.tier === 'strong' ? 'rgba(223,83,83,0.28)' : f.tier === 'moderate' ? 'rgba(241,145,46,0.22)' : 'rgba(103,114,138,0.18)',
      line: { width: 0 }, layer: 'below'
    });
  }
  return shapes;
}

function windowShape(window: IncidentWindow): Record<string, unknown> {
  return {
    type: 'rect', xref: 'x', yref: 'paper',
    x0: window.start, x1: window.end, y0: 0, y1: 1,
    fillcolor: 'rgba(255,160,46,0.10)', line: { color: 'rgba(255,160,46,0.55)', width: 1, dash: 'dot' },
    layer: 'below'
  };
}

export function TimelineStrip({ findings }: { findings: Finding[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const incident = useIncidentWindow();
  // Axis/grid/font colors come from CSS vars read at draw time (chartTheme), so
  // a light/dark toggle must trigger a redraw — same signal the other Plotly
  // charts re-theme on. Bumping this re-runs the draw effect below.
  const [themeTick, setThemeTick] = useState(0);

  useEffect(() => {
    const onTheme = () => setThemeTick((n) => n + 1);
    window.addEventListener('sarkart-theme-change', onTheme);
    return () => window.removeEventListener('sarkart-theme-change', onTheme);
  }, []);

  useEffect(() => {
    const el = ref.current;
    const Plotly = window.Plotly;
    if (!el || !Plotly) return undefined;

    const rows = buildTimelineRows();
    if (!rows.length) { el.innerHTML = ''; return undefined; }

    const theme = chartTheme();
    const styles = getComputedStyle(document.documentElement);
    const labelColor = styles.getPropertyValue('--text-1').trim() || theme.text;
    const axisColor = styles.getPropertyValue('--text-2').trim() || theme.text;
    const rowIndex = {} as Record<Subsystem, number>;
    rows.forEach((row, i) => { rowIndex[row.subsystem] = i; });

    const n = rows.length;
    const usableGap = ROW_GAP;
    const rowH = (1 - usableGap * (n - 1)) / n;

    const traces = rows.map((row: TimelineRow, i: number) => ({
      x: row.points.map((p) => p[0]),
      y: row.points.map((p) => p[1]),
      type: 'scatter', mode: 'lines', name: row.label,
      xaxis: 'x', yaxis: i === 0 ? 'y' : `y${i + 1}`,
      line: { color: SUBSYSTEM_COLOR[row.subsystem], width: 1.25 },
      fill: 'tozeroy', fillcolor: `${SUBSYSTEM_COLOR[row.subsystem]}22`,
      hovertemplate: `${row.label}: %{y:.1f}${row.unit}<extra></extra>`
    }));

    const layout: Record<string, unknown> = {
      height: n * ROW_HEIGHT + 64,
      margin: { l: 8, r: 10, t: 18, b: 34 },
      paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
      font: { color: axisColor, family: theme.font, size: 11 },
      showlegend: false, dragmode: 'select', selectdirection: 'h',
      xaxis: {
        type: 'date', anchor: n === 1 ? 'y' : `y${n}`,
        gridcolor: theme.grid, zeroline: false, showspikes: true, spikemode: 'across', spikethickness: 1,
        tickfont: { color: axisColor, size: 11 }
      },
      shapes: [
        ...findingShapes(findings, rowIndex),
        ...(incident.window ? [windowShape(incident.window)] : [])
      ],
      annotations: rows.map((row, i) => ({
        text: row.label, xref: 'paper', yref: 'paper',
        x: 0, y: 1 - i * (rowH + usableGap), xanchor: 'left', yanchor: 'top',
        showarrow: false, font: { size: 11, color: labelColor }
      }))
    };

    rows.forEach((_row, i) => {
      const top = 1 - i * (rowH + usableGap);
      const bottom = top - rowH;
      const graphTop = top - rowH * ROW_LABEL_BAND;
      layout[i === 0 ? 'yaxis' : `yaxis${i + 1}`] = {
        domain: [Math.max(0, bottom), graphTop],
        showticklabels: false, gridcolor: theme.grid, zeroline: false, fixedrange: true
      };
    });

    void Plotly.newPlot(el, traces, layout, { displayModeBar: false, responsive: true });

    const onSelected = (evt: { range?: { x?: [unknown, unknown] } } | undefined) => {
      const xr = evt?.range?.x;
      if (!xr) return;
      const start = new Date(xr[0] as string).getTime();
      const end = new Date(xr[1] as string).getTime();
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        setWindow({ start, end });
      }
    };
    (el as unknown as { on: (ev: string, cb: unknown) => void }).on('plotly_selected', onSelected);

    return () => { Plotly.purge?.(el); };
    // Re-render when findings, the window, or the theme change so highlights and
    // axis/grid colors stay in sync.
  }, [findings, incident.window, themeTick]);

  return (
    <section className="timeline-strip homeContBlock" aria-label="Subsystem timeline">
      <header className="timeline-head">
        <h3 className="timeline-heading">Timeline</h3>
        <span className="timeline-hint">Drag to set the incident window</span>
      </header>
      <div ref={ref} className="timeline-plot" />
    </section>
  );
}
