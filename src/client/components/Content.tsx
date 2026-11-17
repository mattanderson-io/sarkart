import { useEffect } from 'preact/hooks';
import { DiagnosticDashboard } from './DiagnosticDashboard';
import { Footer } from './Footer';
import { HeatmapDashboard } from './HeatmapDashboard';
import { assetPath } from '../asset-path';
import { initTheme, toggleTheme } from '../lib/theme';

function IconUse({ id }: { id: string }) {
  return (
    <svg className="icon" aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

function ArrowIcon() {
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}

type KpiCardProps = {
  metric: string;
  label: string;
  valueId: string;
  chartId: string;
  arrowId: string;
  timeId: string;
  iconId: string;
  unit?: string;
};

function KpiCard({ metric, label, valueId, chartId, arrowId, timeId, iconId, unit }: KpiCardProps) {
  return (
    <div className="kpi-card contDash" data-kpi={metric}>
      <div className="kpi-top">
        <div>
          <div className="kpi-label">
            <IconUse id={iconId} />
            {label}
          </div>
          <div className="kpi-value"><span id={valueId}>{metric === 'memory' ? '' : '\u00a0'}</span>{unit ? <sup>{unit}</sup> : null}</div>
        </div>
        <div id={chartId} />
      </div>
      <div className="kpi-meta">
        <a href="#" className="small-box-footer" id={arrowId} title={`View ${label.replace('Peak ', '')} chart`}>
          <span>at</span> <span id={timeId}>&nbsp;</span>
          <ArrowIcon />
        </a>
      </div>
    </div>
  );
}

function ChartBlock({ blockClass, containerId, titleId, notesId, head = true }: { blockClass: string; containerId: string; titleId?: string; notesId: string; head?: boolean }) {
  return (
    <div className={`chart-block ${blockClass} homeContBlock`}>
      <div className="chart-card">
        {head ? (
          <div className="chart-head is-empty">
            <h3 className="chart-heading" />
            <div className="chart-head-tools">
              <p className="chart-subtitle" />
              <button type="button" className="chart-info-btn" hidden aria-expanded="false" aria-label="What does this chart show?" title="What does this chart show?">
                <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
              </button>
              <div className="chart-info-pop" role="tooltip" hidden />
            </div>
          </div>
        ) : (
          <h5 className="container-title" id={titleId}>&nbsp;</h5>
        )}
        <div className="chart-body"><div id={containerId} /></div>
        <p id={notesId} className="container-notes" />
      </div>
    </div>
  );
}

function TopBar() {
  useEffect(() => {
    initTheme();
  }, []);

  useEffect(() => {
    const button = document.getElementById('btnTopMenu');
    const panel = document.getElementById('topBarMenuPanel');
    if (!button || !panel) return undefined;

    const closeMenu = () => {
      panel.hidden = true;
      button.setAttribute('aria-expanded', 'false');
    };

    const onButtonClick = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const shouldOpen = panel.hidden;
      panel.hidden = !shouldOpen;
      button.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    };

    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest?.('.top-bar-menu')) closeMenu();
    };

    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !panel.hidden) closeMenu();
    };

    const onPanelClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest?.('.top-bar-menu-item')) closeMenu();
    };

    button.addEventListener('click', onButtonClick);
    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onDocumentKeyDown);
    panel.addEventListener('click', onPanelClick);

    return () => {
      button.removeEventListener('click', onButtonClick);
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onDocumentKeyDown);
      panel.removeEventListener('click', onPanelClick);
    };
  }, []);

  return (
    <div className="top-bar" id="topBar">
      <div className="top-bar-info" id="fileInfoBar">
        <div className="file-info-group"><span className="file-info-label">Host</span><span className="file-info-value num" id="fileInfoHost">&mdash;</span></div>
        <div className="file-info-group"><span className="file-info-label">OS</span><span className="file-info-value num" id="fileInfoOS">&mdash;</span></div>
        <div className="file-info-group"><span className="file-info-label">Dates</span><span className="file-info-value num" id="fileInfoDates">&mdash;</span></div>
        <div className="file-info-group"><span className="file-info-label">File</span><span className="file-info-value num" id="fileInfoName" title="">&mdash;</span></div>
      </div>

      <div className="top-bar-actions">
        <button type="button" className="top-bar-btn" id="btnThemeToggle" title="Toggle theme" aria-label="Toggle theme" onClick={(event) => {
          event.preventDefault();
          void toggleTheme();
        }}>
          <svg className="icon icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
          <svg className="icon icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
        </button>
        <a href="#" className="top-bar-btn toolbar-post-upload" id="btnCmdk" title="Command palette (⌘K)">
          <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <kbd>⌘K</kbd>
        </a>
        <div className="top-bar-menu toolbar-post-upload">
          <button type="button" className="top-bar-btn top-bar-menu-btn" id="btnTopMenu" aria-haspopup="menu" aria-expanded="false" aria-controls="topBarMenuPanel" title="Menu">
            <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="top-bar-menu-panel" id="topBarMenuPanel" role="menu" hidden>
            <a href="#" className="top-bar-menu-item" id="btnExportPDF" role="menuitem" title="Export PDF report" onClick={(event) => {
              event.preventDefault();
              void window.sarkartGeneratePDFReport?.();
            }}>
              <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
              Export PDF
            </a>
            <a href="#" className="top-bar-menu-item" id="btnOpenAnother" role="menuitem" title="Open another SAR file">
              <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              Open file
            </a>
            <a href="" className="top-bar-menu-item" id="btnReset" role="menuitem" title="Reload and clear all data">
              <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 3v6h6" /></svg>
              Reset
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function LandingUpload() {
  return (
    <div className="landing-grid landing-hero">
      <div className="homeContBlock">
        <div className="upload-card">
          <div id="start" className="form-container uploader sar-file-uploader">
            <div className="upload-idle">
              <div className="upload-icon">
                <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              </div>
              <h3 className="upload-headline">Drop a SAR file to begin</h3>
              <p className="upload-sub">or use the button below. Plain-text SAR output from <code>sar -A</code>.</p>
              <span className="button-wrapper">
                <span id="file-upload-btn" className="btn uploadBtn">
                  <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                  Browse and upload
                </span>
              </span>
              <p className="upload-privacy">
                <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                Your file never leaves this machine
              </p>
              <div className="upload-filename-wrap"><span className="fileinput-filename" /></div>
            </div>

            <div className="d-none hide" id="spinner">
              <div id="progressContainer">
                <div className="progress-stages" aria-hidden="true">
                  <span className="progress-stage is-active" data-stage="reading">Reading</span>
                  <span className="progress-stage-sep" />
                  <span className="progress-stage" data-stage="parsing">Parsing</span>
                  <span className="progress-stage-sep" />
                  <span className="progress-stage" data-stage="rendering">Rendering</span>
                </div>
                <div id="progressStep">Preparing…</div>
                <div className="upload-progress-track"><div id="progressBar" /></div>
                <div id="spinnerVal" className="num">0%</div>
                <div id="progressRate" className="progress-rate num" />
                <button id="btnProcessData" type="button" hidden onClick={(event) => {
                  event.preventDefault();
                  void window.sarkartProcessPendingData?.();
                }}>Process data</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="homeContBlock">
        <div className="landing-side">
          <div className="landing-side-header">
            <h2 className="landing-side-title">View Unix SAR data as interactive charts</h2>
            <p className="landing-side-lead">A local-only dashboard for peak CPU, memory, and load, with drill-downs per device and interface. Supports Linux (RHEL, SuSE, Ubuntu).</p>
          </div>

          <ul className="landing-highlights">
            <li>
              <span className="hl-icon"><svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg></span>
              <div><strong>Up to 20&times; faster than sarchart</strong><span>A 313&nbsp;MB RHEL&nbsp;9 SAR file loads in ~2 seconds.</span></div>
            </li>
            <li>
              <span className="hl-icon"><svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg></span>
              <div><strong>Client-side only</strong><span>Your file never leaves the browser. PDF export also runs locally.</span></div>
            </li>
          </ul>

          <div className="landing-side-footer">
            <a href="#" id="btnTrySample" className="landing-side-link">Try with sample data &rarr;</a>
          </div>
        </div>
      </div>
    </div>
  );
}

function DateFilter() {
  return (
    <div className="hide" id="dateFilterBlock">
      <div className="date-filter-card">
        <span className="date-filter-label">
          <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
          Date range
        </span>
        <select id="dateFilterMode" className="select-control">
          <option value="all">All days</option>
          <option value="single">Single day</option>
          <option value="range">Date range</option>
        </select>
        <select id="dateFilterStart" className="select-control" hidden />
        <span id="dateFilterRangeSep" hidden>to</span>
        <select id="dateFilterEnd" className="select-control" hidden />
        <button id="dateFilterApply" type="button" hidden>Apply</button>
        <span id="dateFilterInfo" className="num" />
      </div>
    </div>
  );
}

export function Content({ heatmapVisible }: { heatmapVisible: boolean }) {
  return (
    <>
      <div id="content" className="scrolling">
        <section className="container-fluid">
          <TopBar />

          <div className="landing-hero-row">
            <h1 id="logo-header" className="landing-brand">
              <span className="landing-brand-lockup">
                <img className="landing-brand-logo" src={assetPath('images/racing-penguin.webp')} alt="SARkart logo" />
                <span className="landing-brand-text"><b>SAR</b><span>kart</span></span>
              </span>
              <span className="landing-brand-tagline">Unix SAR data, as charts</span>
            </h1>
          </div>

          <DateFilter />

          {/* Legacy peak KPI block — kept in the DOM (hidden via CSS) as a
              transitional compatibility shim: SarDataBridge still writes these
              value spans, LandingBridge's waitForPeakData gates "app loaded" on
              #peakCPU, and the PDF export reads them. Removed once PDF is
              repointed at the findings data layer (Phase 4 of the redesign). */}
          <div className="remove" id="peakBlock" aria-hidden="true">
            <KpiCard metric="cpu" label="Peak CPU" valueId="peakCPU" chartId="peakCPUChart" arrowId="btnCPUArrow" timeId="peakCPUTime" iconId="i-cpu" unit="%" />
            <KpiCard metric="load" label="Peak Load" valueId="peakLoad" chartId="peakLoadChart" arrowId="btnLoadArrow" timeId="peakLoadTime" iconId="i-gauge" />
            <KpiCard metric="memory" label="Peak Memory" valueId="peakMemory" chartId="peakMemoryChart" arrowId="btnMemoryArrow" timeId="peakMemoryTime" iconId="i-memory" unit="%" />
          </div>

          <DiagnosticDashboard />

          <LandingUpload />

          <div className="page-title-row section-header homeContBlock title-empty">
            <h2 className="boxed" id="pageTitle" />
          </div>

          {/* The heatmap lives in its own Preact-owned block so it never shares
              #containerA with the imperatively-rendered Plotly category charts —
              that shared container was what left a stale chart above the heatmap. */}
          {heatmapVisible ? (
            <div className="chart-block homeContBlock add" id="heatmapBlock">
              <div className="chart-card">
                <div className="chart-body">
                  <div className="is-heatmap-host"><HeatmapDashboard /></div>
                </div>
              </div>
            </div>
          ) : null}

          <ChartBlock blockClass="contABlock" containerId="containerA" notesId="containerANotes" />
          <ChartBlock blockClass="contBBlock" containerId="containerB" notesId="containerBNotes" />
          <ChartBlock blockClass="contCBlock" containerId="containerC" notesId="containerCNotes" />
          <ChartBlock blockClass="contDBlock" containerId="containerD" notesId="containerDNotes" />
          <ChartBlock blockClass="contMBlock" containerId="containerM" notesId="containerMNotes" titleId="containerMTitle" head={false} />
        </section>

        <Footer />
      </div>

      <div className="container1" hidden aria-hidden="true" />
    </>
  );
}
