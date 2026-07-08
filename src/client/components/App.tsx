import { useEffect, useState } from 'preact/hooks';
import { ChartRouterBridge } from './ChartRouterBridge';
import { CommandPalette } from './CommandPalette';
import { CoreEngineBridge } from './CoreEngineBridge';
import { Content } from './Content';
import { FileUploadBridge } from './FileUploadBridge';
import { IconSprite } from './IconSprite';
import { LandingBridge } from './LandingBridge';
import { LegacyScripts } from './LegacyScripts';
import { NetworkUnitBridge } from './NetworkUnitBridge';
import { PdfExportBridge } from './PdfExportBridge';
import { SarDataBridge } from './SarDataBridge';
import { Sidebar } from './Sidebar';
import { SidebarCollapse } from './SidebarCollapse';
import { UiBridge } from './UiBridge';

export function App() {
  const [heatmapVisible, setHeatmapVisible] = useState(false);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const link = target?.closest?.('#sidebar ul a') as HTMLAnchorElement | null;
      if (!link) return;

      if (link.id === 'btnHeatmap') {
        event.preventDefault();
        // The heatmap renders in its own Preact-owned block (#heatmapBlock), so
        // hide + clear all four category chart blocks — this leaves no stale
        // imperative Plotly chart around the heatmap, in either direction.
        window.chartPage?.();
        ['A', 'B', 'C', 'D'].forEach((id) => window.hideBlock?.(id));
        const title = document.getElementById('pageTitle');
        if (title) title.textContent = 'Heatmap Dashboard';
        // The title row's visibility is driven by the `title-empty` class
        // (LandingBridge toggles it from the pageTitle text); set it directly
        // so the "Heatmap Dashboard" heading shows immediately.
        document.querySelector('.page-title-row')?.classList.remove('title-empty');
        setHeatmapVisible(true);
        return;
      }

      if (link.id === 'btnSAR') {
        // Dashboard = KPI cards + summary only. Category chart blocks are shown
        // imperatively (showBlock) when a page is opened and nothing hid them
        // on the way back, so they lingered under the dashboard. Hide + clear
        // all of them and drop the stale page title so this matches the clean
        // initial dashboard (KPIs, no leftover charts, no heading).
        ['A', 'B', 'C', 'D', 'M'].forEach((id) => window.hideBlock?.(id));
        const title = document.getElementById('pageTitle');
        if (title) title.textContent = '';
        document.querySelector('.page-title-row')?.classList.add('title-empty');
        setHeatmapVisible(false);
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
      <UiBridge />
      <SidebarCollapse />
      <ChartRouterBridge />
      <FileUploadBridge />
      <LandingBridge />
      <NetworkUnitBridge />
      <PdfExportBridge />
      <SarDataBridge />
      <LegacyScripts />
    </>
  );
}
