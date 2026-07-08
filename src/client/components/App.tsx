import { useEffect, useState } from 'preact/hooks';
import { ChartRouterBridge } from './ChartRouterBridge';
import { CommandPalette } from './CommandPalette';
import { CoreEngineBridge } from './CoreEngineBridge';
import { Content } from './Content';
import { IconSprite } from './IconSprite';
import { LandingBridge } from './LandingBridge';
import { LegacyScripts } from './LegacyScripts';
import { NetworkUnitBridge } from './NetworkUnitBridge';
import { PdfExportBridge } from './PdfExportBridge';
import { SarDataBridge } from './SarDataBridge';
import { Sidebar } from './Sidebar';

export function App() {
  const [heatmapVisible, setHeatmapVisible] = useState(false);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const link = target?.closest?.('#sidebar ul a') as HTMLAnchorElement | null;
      if (!link) return;

      if (link.id === 'btnHeatmap') {
        event.preventDefault();
        window.chartPage?.();
        window.showBlock?.('A');
        ['B', 'C', 'D'].forEach((id) => window.hideBlock?.(id));
        const title = document.getElementById('pageTitle');
        if (title) title.textContent = 'Heatmap Dashboard';
        setHeatmapVisible(true);
        return;
      }

      if (!link.hasAttribute('data-bs-toggle')) {
        setHeatmapVisible(false);
      }
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  useEffect(() => {
    window.sarkartRefreshHeatmaps = () => {
      if (!heatmapVisible) return;
      setHeatmapVisible(false);
      requestAnimationFrame(() => setHeatmapVisible(true));
    };
  }, [heatmapVisible]);

  return (
    <>
      <IconSprite />
      <div className="wrapper">
        <Sidebar />
        <button type="button" id="sidebarCollapse" className="sidebar-edge-toggle" aria-label="Collapse sidebar" title="Collapse sidebar (⌘B)">
          <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6 8.5 12l6 6" /></svg>
        </button>
        <Content heatmapVisible={heatmapVisible} />
      </div>
      <CommandPalette />
      <CoreEngineBridge />
      <ChartRouterBridge />
      <LandingBridge />
      <NetworkUnitBridge />
      <PdfExportBridge />
      <SarDataBridge />
      <LegacyScripts />
    </>
  );
}
