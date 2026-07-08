import { createPortal } from 'preact/compat';
import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  convertKBs,
  convertSeries,
  findSeriesPeak,
  getNetworkUnit,
  looksLikeNetworkBytesChart,
  networkUnitOrder,
  relabelAxisTitle,
  relabelSeries,
  resolveNetworkUnit,
  setNetworkUnit,
  type NetworkUnitName
} from '../lib/networkUnits';

type LastNetworkCall = {
  containerId: string;
  title: string;
  yAxisTitle: string;
  yTickInterval: unknown;
  series: LegacySeries[];
  original: NonNullable<typeof window.printMultiChart>;
};

function chartBlock(container: HTMLElement) {
  return container.closest('.chart-block') as HTMLElement | null;
}

function chartShell(container: HTMLElement) {
  return container.closest('.chart-card') as HTMLElement | null;
}

function ensureToolbarMount(containerId: string) {
  const container = document.getElementById(containerId);
  if (!container) return null;
  const block = chartBlock(container);
  const shell = chartShell(container);
  if (!block || !shell) return null;

  let mount = block.querySelector<HTMLElement>('.netUnitsToolbarMount');
  if (!mount) {
    mount = document.createElement('div');
    mount.className = 'netUnitsToolbarMount';
    block.insertBefore(mount, shell);
  }
  mount.style.display = '';
  return mount;
}

function renderWithUnit(call: LastNetworkCall, unitName: NetworkUnitName) {
  const peak = findSeriesPeak(call.series);
  const resolved = resolveNetworkUnit(unitName, peak);
  const converted = convertSeries(call.series, resolved.factor).map((series) => ({
    ...series,
    name: relabelSeries(series.name, resolved.suffix)
  }));
  call.original.call(window, call.containerId, call.title, relabelAxisTitle(call.yAxisTitle, resolved.suffix), call.yTickInterval, converted);
  return resolved.name;
}

export function NetworkUnitBridge() {
  const [unit, setUnit] = useState<NetworkUnitName>(() => getNetworkUnit());
  const [lastCall, setLastCall] = useState<LastNetworkCall | null>(null);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [autoLabel, setAutoLabel] = useState('');

  useEffect(() => {
    window.sarkartNetUnit = {
      get: getNetworkUnit,
      convertKBs,
      suffix: () => {
        const current = getNetworkUnit();
        return current === 'Auto' ? 'auto' : current;
      }
    };
  }, []);

  useEffect(() => {
    let timer = 0;

    const install = () => {
      if (typeof window.printMultiChart !== 'function') {
        timer = window.setTimeout(install, 100);
        return;
      }
      if (window.__sarkartUnitsWrapped) return;

      const original = window.printMultiChart;
      window.printMultiChart = (containerId, title, yAxisTitle, yTickInterval, series) => {
        // Only convert units for genuine Interface Traffic charts. Content
        // sniffing alone is too broad — other categories (e.g. per-device disk
        // throughput) also report kB/s and must not be rescaled to Mbps or get
        // the network-units toolbar. ChartRouterBridge flags the network render.
        if (!window.__sarkartNetTrafficRender || !looksLikeNetworkBytesChart(yAxisTitle, series)) {
          return original.apply(window, [containerId, title, yAxisTitle, yTickInterval, series]);
        }

        const call = { containerId, title, yAxisTitle, yTickInterval, series, original };
        const currentUnit = getNetworkUnit();
        const resolved = renderWithUnit(call, currentUnit);
        setLastCall(call);
        setUnit(currentUnit);
        setAutoLabel(currentUnit === 'Auto' ? `Auto: ${resolved}` : '');
        setMount(ensureToolbarMount(containerId));
        return undefined;
      };
      window.__sarkartUnitsWrapped = true;
    };

    install();
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onSidebarClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const link = target?.closest?.('#sidebar a');
      if (!link) return;
      const inNetTraffic = !!link.closest('#ulInterfaceTraffic');
      const toolbar = document.querySelector<HTMLElement>('.netUnitsToolbarMount');
      if (toolbar) toolbar.style.display = inNetTraffic ? '' : 'none';
      if (!inNetTraffic) {
        setLastCall(null);
        setMount(null);
      }
    };
    document.addEventListener('click', onSidebarClick, true);
    return () => document.removeEventListener('click', onSidebarClick, true);
  }, []);

  const toolbar = useMemo(() => {
    if (!lastCall) return null;
    return (
      <div className="netUnitsToolbar">
        <span className="netUnitsToolbar-label">Display units:</span>
        <select
          className="netUnitsToolbar-select"
          aria-label="Network display units"
          value={unit}
          onChange={(event) => {
            const next = event.currentTarget.value as NetworkUnitName;
            setNetworkUnit(next);
            setUnit(next);
            const resolved = renderWithUnit(lastCall, next);
            setAutoLabel(next === 'Auto' ? `Auto: ${resolved}` : '');
            window.sarkartRefreshHeatmaps?.();
          }}
        >
          {networkUnitOrder.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <span className="netUnitsToolbar-hint">{autoLabel}</span>
      </div>
    );
  }, [autoLabel, lastCall, unit]);

  return mount && toolbar ? createPortal(toolbar, mount) : null;
}
