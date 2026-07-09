import { useEffect } from 'preact/hooks';
import { buildCpuByCore } from '../lib/cpuIndex';
import { getSeriesWithPeak } from '../lib/sarData';
import { getOS, getServerInfo, grepHeaders, progressBarReset, show, showBlock } from '../lib/sarEngine';
import { parseArrayBufferParallel } from '../lib/parallelParse';
import { parseSarTextChunked } from '../lib/sarParser';
import { filterSarDataByDates, getDates, getRows, hasData, setCpuByCore, setSarData, setSarDataFromJoined } from '../lib/sarStore';

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Yield to the event loop so the browser can paint and process input between
 * heavy synchronous steps (index re-slice, per-category Plotly re-renders).
 * Uses a 0ms timeout rather than requestAnimationFrame so it still fires when
 * the tab is backgrounded — the load/refilter pipeline must run to completion
 * regardless of tab focus.
 */
function yieldToBrowser() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

function setHtml(id: string, html: string) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function clearChartContainers() {
  ['pageTitle', 'containerA', 'containerB', 'containerC'].forEach((id) => setHtml(id, ''));
}

function setVisible(id: string, visible: boolean) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = visible ? '' : 'none';
  el.classList.toggle('hide', !visible);
  if (visible) el.classList.add('show');
}

function showSelector(selector: string) {
  show(selector);
  selector.split(',').map((part) => part.trim().replace(/^#/, '')).forEach((id) => {
    if (id) setVisible(id, true);
  });
}

/**
 * SARkart supports Linux SAR files only. When a non-Linux file is loaded,
 * hide the (empty) KPI dashboard and show a clear notice in the fallback
 * slot rather than leaving the user with a blank dashboard.
 */
function showUnsupportedOs(os: string | undefined) {
  clearChartContainers();
  document.querySelectorAll<HTMLElement>('.contDash').forEach((el) => { el.style.display = 'none'; });

  showBlock('M');
  const message = document.getElementById('containerM');
  if (message) {
    const detected = os ? ` (detected \u201C${os}\u201D)` : '';
    message.innerHTML = `SARkart supports Linux SAR files only${detected}. Please upload a sar file collected on Linux.`;
  }

  const pageTitle = document.getElementById('pageTitle');
  if (pageTitle) pageTitle.textContent = 'Unsupported SAR file';
  document.querySelector('.page-title-row')?.classList.remove('title-empty');

  window.updateProgress?.(100, 'Unsupported OS');
  window.setTimeout(() => progressBarReset(), 1000);
  setVisible('sidebar', true);
  setVisible('sidebarCollapse', true);
}

function parseNumber(value: string | undefined) {
  const number = parseFloat(value || '');
  return Number.isFinite(number) ? number : 0;
}



function updatePeakCpu() {
  const cpuLines = getRows('CPU-%usr');
  let peak = 0;
  let peakTime = '';

  cpuLines.forEach((line) => {
    const parts = line.split(',');
    if (parts[2] !== 'all') return;
    const value = parseNumber(parts[3]);
    if (value <= peak) return;
    peak = value;
    const timeParts = (parts[1] || '').split('|');
    peakTime = `${timeParts[0] || ''} ${timeParts[1] || ''}`.trim();
  });

  setHtml('peakCPU', String(parseInt(String(peak), 10)));
  setHtml('peakCPUTime', peakTime);
}

/**
 * Writes a peak KPI card's value + time from a section's series. The peak
 * computation is the pure `getSeriesWithPeak`; the DOM write lives here (it's
 * the component's job, not the data layer's).
 */
function writePeak(target: string, key: string, column: number) {
  const { peakValue, peakTime } = getSeriesWithPeak(key, column);
  const id = target.replace(/^#/, '');
  setHtml(id, String(parseInt(String(peakValue), 10)));
  const timeEl = document.getElementById(`${id}Time`);
  if (timeEl) timeEl.textContent = peakTime;
}

function configureDateFilter() {
  const dates = getDates();
  const block = document.getElementById('dateFilterBlock');
  const start = document.getElementById('dateFilterStart') as HTMLSelectElement | null;
  const end = document.getElementById('dateFilterEnd') as HTMLSelectElement | null;
  const info = document.getElementById('dateFilterInfo');

  if (!block || !start || !end) return;

  if (dates.length > 1) {
    block.classList.remove('hide');
    block.style.display = '';
    start.innerHTML = '';
    end.innerHTML = '';
    dates.forEach((date) => {
      start.appendChild(new Option(date, date));
      end.appendChild(new Option(date, date));
    });
    end.value = dates[dates.length - 1];
    if (info) info.textContent = `${dates.length} days detected`;
  } else {
    block.style.display = 'none';
  }
}

function wireDateFilter() {
  if (window.__sarkartPreactDateFilter) return;
  window.__sarkartPreactDateFilter = true;

  const mode = document.getElementById('dateFilterMode') as HTMLSelectElement | null;
  const start = document.getElementById('dateFilterStart') as HTMLSelectElement | null;
  const end = document.getElementById('dateFilterEnd') as HTMLSelectElement | null;
  const sep = document.getElementById('dateFilterRangeSep');
  const apply = document.getElementById('dateFilterApply') as HTMLButtonElement | null;
  if (!mode || !start || !end || !sep || !apply) return;

  const syncMode = () => {
    const value = mode.value;
    start.hidden = value === 'all';
    end.hidden = value !== 'range';
    sep.hidden = value !== 'range';
    apply.hidden = value === 'all';

    if (value === 'all') {
      void dateFilterRefresh(null, `${getDates().length} days shown`);
    }
  };

  const applyFilter = () => {
    let dates: string[] = [];
    let info = '';
    if (mode.value === 'single') {
      dates = [start.value];
      info = `Showing: ${start.value}`;
    } else {
      const allDates = getDates();
      const startIndex = allDates.indexOf(start.value);
      const endIndex = allDates.indexOf(end.value);
      const first = Math.min(startIndex, endIndex);
      const last = Math.max(startIndex, endIndex);
      dates = allDates.slice(first, last + 1);
      info = `Showing: ${dates.length} days (${dates[0]} to ${dates[dates.length - 1]})`;
    }
    void dateFilterRefresh(dates, info);
  };

  mode.addEventListener('change', syncMode);
  apply.addEventListener('click', applyFilter);
  syncMode();
}

/**
 * Programmatically scope the (multi-day) date filter to a single day and apply
 * it — used by a finding's deep-dive so the chart it opens shows the day the
 * finding occurred. Reflects the selection in the filter UI (matching
 * syncMode('single')) so the user sees which day is active, then awaits the
 * same `dateFilterRefresh` a manual apply runs. No-op if already on that day.
 */
async function applyDayFilter(day: string) {
  const mode = document.getElementById('dateFilterMode') as HTMLSelectElement | null;
  const start = document.getElementById('dateFilterStart') as HTMLSelectElement | null;
  const end = document.getElementById('dateFilterEnd') as HTMLSelectElement | null;
  const sep = document.getElementById('dateFilterRangeSep');
  const apply = document.getElementById('dateFilterApply') as HTMLButtonElement | null;
  if (!mode || !start) return;
  if (mode.value === 'single' && start.value === day) return; // already scoped there

  mode.value = 'single';
  start.hidden = false;
  if (end) end.hidden = true;
  if (sep) sep.hidden = true;
  if (apply) apply.hidden = false;
  start.value = day;
  await dateFilterRefresh([day], `Showing: ${day}`);
}

/**
/**
 * Re-slices the active data index to the selected dates and redoes everything
 * that depends on it: peak KPI cards + their pie charts, the per-core CPU
 * index, and the device/interface traffic/error lists.
 *
 * Yields to the browser (`yieldToBrowser`) only at the boundaries that matter
 * for responsiveness on large multi-day files: once so the "Filtering..."
 * label paints before the (expensive) re-slice, once so the recomputed KPIs
 * paint, and once before each heavy per-category Plotly re-render. The
 * per-core rebuild is genuinely async (chunked) and is awaited directly. The
 * fast synchronous KPI recompute (peak scans + static pie charts) runs as a
 * single group rather than being sliced by a yield after every statement.
 */
async function dateFilterRefresh(dates: string[] | null, info: string) {
  // No file loaded yet (e.g. wireDateFilter's initial syncMode() call on
  // mount, before any data exists) — nothing to (re)filter.
  if (!hasData()) return;

  const applyBtn = document.getElementById('dateFilterApply') as HTMLButtonElement | null;
  const infoEl = document.getElementById('dateFilterInfo');
  if (infoEl) infoEl.textContent = 'Filtering...';
  if (applyBtn) applyBtn.disabled = true;

  // Let "Filtering..." paint, then re-slice (the heaviest step on big files).
  await yieldToBrowser();
  try {
    filterSarDataByDates(dates);
  } catch (error) {
    console.error('[SARkart] filterSarDataByDates failed:', error);
  }
  if (infoEl) infoEl.textContent = info;

  // Recompute the KPI cards + donuts — all fast synchronous scans, one group.
  updatePeakCpu();
  writePeak('#peakLoad', 'runq-sz-plist-sz', 1);
  const memoryHeader = grepHeaders('kbmemfree');
  if (memoryHeader && memoryHeader !== -1) {
    const cols = memoryHeader.split(',');
    const key = cols.slice(0, 2).join('-');
    const memoryIndex = cols.indexOf('%memused') + 1;
    writePeak('#peakMemory', key, memoryIndex);
  }
  // The diagnostic dashboard recomputes its differential from the refreshed
  // (date-filtered) data. Peaks above are still written for the compat shim
  // (LandingBridge/PDF); the old donut pies are gone with the KPI cards.
  window.dispatchEvent(new Event('sarkart:data-ready'));

  // Let the KPI updates paint before the heavier re-index / per-category renders.
  await yieldToBrowser();
  const cpuIds = await rebuildCpuByCore();
  renderCpuList(cpuIds);

  await yieldToBrowser();
  window.getDevices?.('DEV-tps', 'no', null);

  await yieldToBrowser();
  window.getInterfaceTraffic?.('IFACE-rxpck/s', 'no', null);

  await yieldToBrowser();
  window.getInterfaceErrors?.('IFACE-rxerr/s', 'no', null);

  if (applyBtn) applyBtn.disabled = false;
}

/**
 * Rebuilds the per-core CPU index (`sarStore.getCpuByCore()`, which `getCPU()`
 * reads) from the currently active section index. Shared by the initial
 * dashboard build and by `dateFilterRefresh` — a date filter change swaps the
 * active index to a filtered subset, and without rebuilding this, per-core CPU
 * charts would keep showing pre-filter data (the underlying bug class fixed for
 * the device/interface lists in ChartRouterBridge).
 */
async function rebuildCpuByCore() {
  const { ids, byCore } = await buildCpuByCore(getRows('CPU-%usr'));
  setCpuByCore(byCore);
  return ids;
}

function renderCpuList(cpuIds: string[]) {
  const list = document.getElementById('ulCPU');
  if (!list) return;
  list.innerHTML = cpuIds.map((id, index) => (
    `<li><a href="#" data-sns="${index}"><i class="submenu-dot" aria-hidden="true"></i>${id}</a></li>`
  )).join('');

  if (list.dataset.sarkartRouted !== 'true') {
    list.dataset.sarkartRouted = 'true';
    // Reads the per-core index's current id order via a fresh DOM query
    // rather than closing over `cpuIds`, so a later rebuild (date filter
    // change) is reflected without needing to re-attach this listener.
    list.addEventListener('click', (event) => {
      const link = (event.target as Element | null)?.closest?.('a') as HTMLAnchorElement | null;
      if (!link) return;
      event.preventDefault();
      window.chartPage?.();
      const label = (link.textContent || '').trim();
      if (label) window.getCPUchart?.(label);
    });
  }

  window.dispatchEvent(new Event('sarkart:cpu-list'));
}

async function buildCpuList() {
  await delay(500);
  const cpuIds = await rebuildCpuByCore();
  renderCpuList(cpuIds);
}

async function initializeDashboard() {
  window.updateProgress?.(88, 'Detecting server info...');
  await delay(10);

  getServerInfo();
  clearChartContainers();

  window.updateProgress?.(90, 'Loading dashboard...');
  await delay(10);

  // SARkart is Linux-only. A non-Linux (AIX/Solaris/unknown) header means the
  // Linux sections the dashboard reads won't exist, so surface a clear notice
  // instead of a silently-empty dashboard.
  const os = getOS();
  if (os !== 'LINUX') {
    showUnsupportedOs(os);
    return;
  }

  document.getElementById('peakBlock')?.classList.add('add');
  showSelector('#btnSAR, #btnCPUs, #btnMem, #btnDevices, #btnProcesses, #btnSwap, #btnPaging, #btnPage, #btnIO, #btnLoad, #btnInterfaceTraffics, #btnInterfaceErrors, #btnNFS, #btnSockets');

  window.updateProgress?.(92, 'Calculating peak values...');
  updatePeakCpu();
  writePeak('#peakLoad', 'runq-sz-plist-sz', 1);
  const memoryHeader = grepHeaders('kbmemfree');
  if (memoryHeader && memoryHeader !== -1) {
    const cols = memoryHeader.split(',');
    const key = cols.slice(0, 2).join('-');
    const memoryIndex = cols.indexOf('%memused') + 1;
    writePeak('#peakMemory', key, memoryIndex);
  }
  writePeak('#peakIO', 'kbswpfree-kbswpused', 3);

  window.updateProgress?.(95, 'Loading devices & interfaces...');
  window.getDevices?.('DEV-tps', 'no', null);
  window.getInterfaceTraffic?.('IFACE-rxpck/s', 'no', null);
  window.getInterfaceErrors?.('IFACE-rxerr/s', 'no', null);

  // Signal the diagnostic dashboard to compute its differential from the loaded
  // data. Peaks above still feed the compat shim (LandingBridge/PDF).
  window.dispatchEvent(new Event('sarkart:data-ready'));
  void buildCpuList();
  configureDateFilter();

  window.updateProgress?.(99, 'Almost ready...');
  await delay(10);
  document.getElementById('sidebar')?.classList.remove('active');
  document.querySelectorAll<HTMLElement>('.contDash').forEach((el) => { el.style.display = 'flex'; });
  window.updateProgress?.(100, 'Done!');
  window.setTimeout(() => progressBarReset(), 1000);
  setVisible('sidebar', true);
  setVisible('sidebarCollapse', true);
}

async function processPendingResult() {
  const pending = window._pendingResult;
  const buffer = pending?.target?.buffer;
  const text = pending?.target?.result;
  if (!buffer && !text) return;

  const processButton = document.getElementById('btnProcessData') as HTMLButtonElement | null;
  if (processButton) {
    processButton.hidden = true;
    processButton.style.display = 'none';
  }

  window.updateProgress?.(25, 'Parsing SAR data... (0%)');
  await delay(50);

  if (buffer) {
    // Large-file path: parse the raw bytes across Web Workers (lifts the
    // ~512 MB single-string ceiling that readAsText hits) and ingest the
    // JOINED result directly into the packed store — no millions of transient
    // row strings on the main thread.
    const joined = await parseArrayBufferParallel(buffer, (percent) => {
      window.updateProgress?.(25 + Math.round(percent * 0.55), `Parsing SAR data... (${percent}%)`);
    });
    window._pendingResult = undefined;
    window.updateProgress?.(82, 'Building data index...');
    setSarDataFromJoined(joined);
    await initializeDashboard();
    return;
  }

  const parsed = await parseSarTextChunked(text as string, {
    onProgress: ({ percent }) => {
      window.updateProgress?.(25 + Math.round(percent * 0.55), `Parsing SAR data... (${percent}%)`);
    }
  });

  window._pendingResult = undefined;
  window.updateProgress?.(82, 'Building data index...');
  setSarData(parsed);
  await initializeDashboard();
}

export function SarDataBridge() {
  window.sarkartProcessPendingData = processPendingResult;

  useEffect(() => {
    // The legacy engine that used to bind its own #dateFilterMode/
    // #dateFilterApply handlers has been removed, so wire directly on
    // mount — no late-loading script to race against anymore.
    wireDateFilter();
    window.sarkartApplyDay = applyDayFilter;

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest?.('#btnProcessData')) return;
      event.preventDefault();
      processPendingResult().catch((error) => {
        console.error('[SARkart] Failed to process SAR data:', error);
        window.updateProgress?.(0, 'Failed to process SAR data');
      });
    };

    document.addEventListener('click', onClick);
    const processButton = document.getElementById('btnProcessData');
    const processObserver = processButton
      ? new MutationObserver(() => {
        if (window._pendingResult) processButton.hidden = false;
      })
      : null;
    if (processButton) {
      processObserver?.observe(processButton, { attributes: true, attributeFilter: ['style', 'hidden'] });
      if (window._pendingResult) processButton.hidden = false;
    }

    return () => {
      document.removeEventListener('click', onClick);
      processObserver?.disconnect();
      if (window.sarkartProcessPendingData === processPendingResult) delete window.sarkartProcessPendingData;
      if (window.sarkartApplyDay === applyDayFilter) delete window.sarkartApplyDay;
    };
  }, []);

  return null;
}
