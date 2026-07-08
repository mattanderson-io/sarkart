import { useEffect, useRef } from 'preact/hooks';
import { chartTheme } from '../lib/chartTheme';
import type { HeatmapGrid } from '../lib/sarData';

type PlotlyHeatmapProps = {
  data: HeatmapGrid | null;
  title: string;
  colorscale: Array<[number, string]>;
  zmax?: number;
  unit?: string;
};

export function PlotlyHeatmap({ data, title, colorscale, zmax, unit = '%' }: PlotlyHeatmapProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !data || !window.Plotly) return undefined;

    const theme = chartTheme();
    const trace = {
      type: 'heatmap',
      z: data.z,
      x: data.x,
      y: data.y,
      colorscale,
      zmin: 0,
      zmax,
      colorbar: {
        title: { text: unit, font: { color: theme.text, size: 10, family: theme.font } },
        tickfont: { color: theme.text, size: 9, family: theme.font },
        thickness: 12,
        len: 0.85
      },
      hovertemplate: `<b>%{x}</b> at %{y}<br>${title}: %{z:.1f}${unit}<extra></extra>`,
      xgap: 2,
      ygap: 2
    };

    const layout = {
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: theme.plot,
      margin: { l: 50, r: 60, t: 36, b: 50 },
      height: 280,
      font: { family: theme.font, color: theme.text },
      title: {
        text: `<b>${title}</b>`,
        font: { color: theme.text, size: 12, family: theme.font },
        x: 0.5,
        xanchor: 'center',
        y: 0.98,
        yanchor: 'top'
      },
      xaxis: {
        tickfont: { color: theme.text, size: 8, family: theme.font },
        tickangle: -45,
        gridcolor: theme.grid,
        fixedrange: true
      },
      yaxis: {
        tickfont: { color: theme.text, size: 8, family: theme.font },
        autorange: 'reversed',
        gridcolor: theme.grid,
        fixedrange: true
      }
    };

    window.Plotly.newPlot(el, [trace], layout, { displaylogo: false, displayModeBar: false, staticPlot: false, scrollZoom: false });

    return () => {
      try { window.Plotly?.purge?.(el); } catch (_error) {}
    };
  }, [colorscale, data, title, unit, zmax]);

  return <div ref={ref} className="heatmap-cell" />;
}
