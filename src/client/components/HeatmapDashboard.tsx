import { useEffect, useMemo } from 'preact/hooks';
import { PlotlyHeatmap } from './PlotlyHeatmap';
import { cpuAll, diskHeatmap, hourGrid, memoryHeatmap, networkHeatmap, findKey } from '../lib/sarData';
import { convertKBs } from '../lib/networkUnits';

const scales = {
  cpu: [[0, '#10151d'], [0.15, '#1e3a5f'], [0.35, '#2563eb'], [0.55, '#ffa02e'], [0.75, '#f97316'], [1, '#ef4444']] as Array<[number, string]>,
  memory: [[0, '#10151d'], [0.15, '#14532d'], [0.35, '#22c55e'], [0.55, '#fbbf24'], [0.75, '#f97316'], [1, '#ef4444']] as Array<[number, string]>,
  iowait: [[0, '#10151d'], [0.2, '#1e3a5f'], [0.4, '#6366f1'], [0.6, '#ffa02e'], [0.8, '#f97316'], [1, '#ef4444']] as Array<[number, string]>,
  load: [[0, '#10151d'], [0.2, '#134e4a'], [0.4, '#14b8a6'], [0.6, '#fbbf24'], [0.8, '#f97316'], [1, '#ef4444']] as Array<[number, string]>,
  swap: [[0, '#10151d'], [0.15, '#312e81'], [0.35, '#6366f1'], [0.55, '#ffa02e'], [0.75, '#f97316'], [1, '#ef4444']] as Array<[number, string]>,
  network: [[0, '#10151d'], [0.2, '#164e63'], [0.4, '#06b6d4'], [0.6, '#22c55e'], [0.8, '#fbbf24'], [1, '#ffa02e']] as Array<[number, string]>,
  disk: [[0, '#10151d'], [0.2, '#3b0764'], [0.4, '#7c3aed'], [0.6, '#ffa02e'], [0.8, '#f97316'], [1, '#ef4444']] as Array<[number, string]>
};

export function HeatmapDashboard() {
  const grids = useMemo(() => {
    const loadKey = findKey('runq-sz');
    const swapKey = findKey('kbswpfree');
    return {
      cpu: hourGrid('CPU-%usr', 3, { filter: cpuAll }),
      memory: memoryHeatmap(),
      iowait: hourGrid('CPU-%usr', 6, { filter: cpuAll }),
      load: loadKey ? hourGrid(loadKey, 2) : null,
      swap: swapKey ? hourGrid(swapKey, 4) : null,
      network: networkHeatmap(convertKBs),
      disk: diskHeatmap()
    };
  }, []);

  useEffect(() => {
    window.sarkartHideChartHead?.('containerA');
  }, []);

  return (
    <div className="heatmap-grid">
      <PlotlyHeatmap data={grids.cpu} title="CPU Utilization" colorscale={scales.cpu} zmax={100} unit="%" />
      <PlotlyHeatmap data={grids.memory} title="Memory Utilization" colorscale={scales.memory} zmax={100} unit="%" />
      <PlotlyHeatmap data={grids.iowait} title="I/O Wait" colorscale={scales.iowait} unit="%" />
      <PlotlyHeatmap data={grids.load} title="Run Queue (Load)" colorscale={scales.load} unit="" />
      <PlotlyHeatmap data={grids.swap} title="Swap Usage" colorscale={scales.swap} unit="%" />
      <PlotlyHeatmap data={grids.network} title="Network Traffic (rx+tx)" colorscale={scales.network} unit={grids.network?.unitLabel || ' KB/s'} />
      <PlotlyHeatmap data={grids.disk} title="Disk Transfers" colorscale={scales.disk} unit=" tps" />
    </div>
  );
}
