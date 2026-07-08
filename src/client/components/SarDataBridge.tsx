import { useEffect } from 'preact/hooks';
import { parseSarTextChunked } from '../lib/sarParser';
import { setSarData } from '../lib/sarStore';

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
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
  window.show?.(selector);
  selector.split(',').map((part) => part.trim().replace(/^#/, '')).forEach((id) => {
    if (id) setVisible(id, true);
  });
}

function hideIds(ids: string[]) {
  ids.forEach((id) => setVisible(id, false));
}

function parseNumber(value: string | undefined) {
  const number = parseFloat(value || '');
  return Number.isFinite(number) ? number : 0;
}

function legacy<T extends (...args: never[]) => unknown>(fn: T | undefined, name: string): T {
  if (typeof fn !== 'function') throw new Error(`${name} is not available yet`);
  return fn;
}

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function updatePeakCpu() {
  const cpuLines = window._idx?.['CPU-%usr'] || [];
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

function configureDateFilter() {
  const dates = window._allDatesArr || [];
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
      window._dateFilterRefresh?.(null, `${window._allDatesArr?.length || 0} days shown`);
    }
  };

  const applyFilter = () => {
    let dates: string[] = [];
    let info = '';
    if (mode.value === 'single') {
      dates = [start.value];
      info = `Showing: ${start.value}`;
    } else {
      const allDates = window._allDatesArr || [];
      const startIndex = allDates.indexOf(start.value);
      const endIndex = allDates.indexOf(end.value);
      const first = Math.min(startIndex, endIndex);
      const last = Math.max(startIndex, endIndex);
      dates = allDates.slice(first, last + 1);
      info = `Showing: ${dates.length} days (${dates[0]} to ${dates[dates.length - 1]})`;
    }
    window._dateFilterRefresh?.(dates, info);
  };

  mode.addEventListener('change', syncMode);
  apply.addEventListener('click', applyFilter);
  syncMode();
}

async function buildCpuList() {
  await delay(500);

  const cpuLines = window._idx?.['CPU-%usr'] || [];
  const cpuIds: string[] = [];
  const cpuIdSet: Record<string, 1> = {};
  const cpuByCore: Record<string, string[]> = {};
  const chunk = 10000;

  for (let index = 0; index < cpuLines.length;) {
    const end = Math.min(index + chunk, cpuLines.length);
    for (let i = index; i < end; i += 1) {
      const parts = cpuLines[i].split(',');
      const id = parts[2];
      if (!cpuIdSet[id]) {
        cpuIdSet[id] = 1;
        cpuIds.push(id);
      }
      cpuByCore[id] ||= [];
      cpuByCore[id].push(cpuLines[i]);
    }
    index = end;
    if (index < cpuLines.length) await delay(0);
  }

  cpuIds.sort(naturalCompare);
  window._cpuByCore = cpuByCore;

  const list = document.getElementById('ulCPU');
  if (!list) return;
  list.innerHTML = cpuIds.map((id, index) => (
    `<li><a href="#" data-sns="${index}"><i class="fa fa-microchip" style="color: #6A55C2" aria-hidden="true"><span class="icon-bg bg-violet"></span></i>${id}</a></li>`
  )).join('');

  list.addEventListener('click', (event) => {
    const link = (event.target as Element | null)?.closest?.('a') as HTMLAnchorElement | null;
    if (!link) return;
    event.preventDefault();
    window.chartPage?.();
    const index = Number(link.dataset.sns || 0);
    window.getCPUchart?.(cpuIds[index]);
  });

  window.dispatchEvent(new Event('sarkart:cpu-list'));
}

async function initializeDashboard() {
  window.updateProgress?.(88, 'Detecting server info...');
  await delay(10);

  window.getServerInfo?.();
  clearChartContainers();

  window.updateProgress?.(90, 'Loading dashboard...');
  await delay(10);

  const os = window.getOS?.();
  if (os === 'LINUX') {
    document.getElementById('peakBlock')?.classList.add('add');
    hideIds(['btnCPU', 'btnFile', 'btnTTY', 'btnMemAlloc', 'btnSysCalls']);
    showSelector('#nav-container, #btnSAR, #btnCPUs, #btnMem, #btnDevices, #btnProcesses, #btnSwap, #btnPaging, #btnPage, #btnIO, #btnLoad, #btnInterfaceTraffics, #btnInterfaceErrors, #btnNFS, #btnSockets, #btnReport, #btnContact');

    window.updateProgress?.(92, 'Calculating peak values...');
    updatePeakCpu();
    window.getGenericData?.('runq-sz-plist-sz', 1, 'no', '#peakLoad');
    const memoryHeader = window.grepHeaders?.('kbmemfree');
    if (memoryHeader && memoryHeader !== -1) {
      const cols = memoryHeader.split(',');
      const key = cols.slice(0, 2).join('-');
      const memoryIndex = cols.indexOf('%memused') + 1;
      window.getGenericData?.(key, memoryIndex, 'no', '#peakMemory');
    }
    window.getGenericData?.('kbswpfree-kbswpused', 3, 'no', '#peakIO');

    window.updateProgress?.(95, 'Loading devices & interfaces...');
    window.getDevices?.('DEV-tps', 'no', null);
    window.getInterfaceTraffic?.('IFACE-rxpck/s', 'no', null);
    window.getInterfaceErrors?.('IFACE-rxerr/s', 'no', null);

    window.printPieChart?.('peakCPUChart', parseInt(document.getElementById('peakCPU')?.textContent || '0', 10), '#00ADEF');
    window.printPieChart?.('peakLoadChart', parseInt(document.getElementById('peakLoad')?.textContent || '0', 10), '#119944');
    window.printPieChart?.('peakMemoryChart', parseInt(document.getElementById('peakMemory')?.textContent || '0', 10), '#F1912E');
    buildCpuList();
    configureDateFilter();
  } else if (os === 'AIX') {
    hideIds(['btnCPUs', 'btnMemFree', 'btnMemAlloc', 'btnSwapUsg', 'btnSwap', 'btnPage', 'btnInterfaceTraffics', 'btnInterfaceErrors', 'btnNFS', 'btnSockets']);
    showSelector('#nav-container, #btnSAR, #btnCPU, #btnMem, #btnDevices, #btnProcesses, #btnPaging, #btnIO, #btnLoad, #btnSysCalls, #btnFile, #btnTTY, #btnReport, #btnContact');
  } else if (os === 'SUNOS') {
    document.getElementById('peakBlock')?.classList.add('add');
    hideIds(['btnCPUs', 'btnMemFree', 'btnSwapUsg', 'btnPage', 'btnInterfaceTraffics', 'btnInterfaceErrors', 'btnNFS', 'btnSockets']);
    showSelector('#nav-container, #btnSAR, #btnCPU, #btnMem, #btnMemAlloc, #btnDevices, #btnProcesses, #btnSwap, #btnPaging, #btnIO, #btnLoad, #btnSysCalls, #btnFile, #btnTTY, #btnReport, #btnContact');
  }

  window.updateProgress?.(99, 'Almost ready...');
  await delay(10);
  document.getElementById('sidebar')?.classList.remove('active');
  document.querySelectorAll<HTMLElement>('.contDash').forEach((el) => { el.style.display = 'flex'; });
  window.updateProgress?.(100, 'Done!');
  window.setTimeout(() => window.progressBarReset?.(), 1000);
  setVisible('sidebar', true);
  setVisible('sidebarCollapse', true);
}

async function processPendingResult() {
  const pending = window._pendingResult;
  const text = pending?.target?.result;
  if (!text) return;

  const processButton = document.getElementById('btnProcessData') as HTMLButtonElement | null;
  if (processButton) {
    processButton.hidden = true;
    processButton.style.display = 'none';
  }

  window.updateProgress?.(25, 'Parsing SAR data... (0%)');
  await delay(50);

  const parsed = await parseSarTextChunked(text, {
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
    wireDateFilter();

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
    };
  }, []);

  return null;
}
