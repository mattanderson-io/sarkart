import { useEffect } from 'preact/hooks';
import {
  getCPU,
  getDeviceSeries,
  getGenericData,
  getInterfaceErrorSeries,
  getInterfaceTrafficSeries,
  getInterrupts,
  getMemoryFreeData,
  grepHeader,
  headerColumnIndex,
  headerSectionKey
} from '../lib/sarData';
import { displayTitle, getHostname, hideBlock, showBlock, showNotes } from '../lib/sarEngine';

/**
 * Chunk 1 of the Preact chart migration: takes every chart category's
 * routing off `sarkart-v1.0.0.min.js`. SARkart is Linux-only — the routed
 * categories are CPU (per-core), Load, Devices, Memory (Free/Usage), Swap
 * Usage, Interface Traffic/Errors, Processes, Swapping, Paging, Page, I/O,
 * Sockets, and NFS Client/Server.
 *
 * Two takeover strategies are used, matching how each category is wired
 * in the legacy engine:
 *
 * 1. Function override — `getCPUchart`, `getDevices`, `getInterfaceTraffic`,
 *    and `getInterfaceErrors` are plain globals that the legacy engine (and
 *    Preact call sites like SarDataBridge's buildCpuList / initializeDashboard)
 *    invoke by reference through `window.*`. Reassigning them here redirects
 *    every call site, including calls made from *inside*
 *    sarkart-v1.0.0.min.js itself (e.g. `_dateFilterRefresh`), the same
 *    trick plotly-charts.js already uses for `printChart`/`printMultiChart`.
 *    No DOM surgery required.
 *
 * 2. Listener takeover — every other nav link (`#btnLoad`, `#btnMemUsg`,
 *    `#btnProcs`, `#btnIO`, etc.) gets a click listener here.
 *    These links are Preact-rendered static markup with no other handlers
 *    (the legacy engine's jQuery ready block that used to bind them is gone),
 *    so a plain `addEventListener` suffices — guarded by a `dataset` flag so a
 *    re-install can't double-bind.
 *
 * `displayTitle` and `showNotes` are shared with `lib/sarEngine` (the same
 * implementations installed as `window.displayTitle` / `window.showNotes`),
 * so this file no longer keeps private copies.
 *
 * Every category is now Preact-owned; `sarkart-v1.0.0.min.js` is no longer
 * needed for chart routing (see preact-migration-remaining.md Chunk 1/2).
 */

/**
 * Shared guard for the category renderers: look up a section by a signature
 * column and, when it's absent, show the "No data found" fallback in slot M and
 * return null so the caller can bail. On success returns the raw header line
 * (for `headerColumnIndex`) and its section key. Collapses the repeated
 * grepHeader -> null-check -> showBlock('M')/showNotes -> headerSectionKey block
 * that appeared in ~17 renderers.
 */
function requireSection(pattern: string): { header: string; sectionKey: string } | null {
  const header = grepHeader(pattern);
  if (header === null) {
    showBlock('M');
    showNotes('M', 'No data found');
    return null;
  }
  return { header, sectionKey: headerSectionKey(header) };
}

function takeOverClick(id: string, handler: (event: MouseEvent) => void) {
  const el = document.getElementById(id);
  if (!el || el.dataset.sarkartRouted === 'true') return;

  el.dataset.sarkartRouted = 'true';
  el.addEventListener('click', (event) => {
    event.preventDefault();
    handler(event);
  });
}

/**
 * Shared renderer for the sidebar's per-id submenu lists (devices, interface
 * traffic, interface errors). Renders one `<li><a data-sns=index>` per id and
 * attaches a single delegated click listener that routes the picked index to
 * `onSelect`. The current series for each list lives in a module map keyed by
 * `listId` (rather than being closed over) so a re-render after a date-filter
 * change is picked up without re-binding the listener — the reason the three
 * renderers previously each kept their own `*ListState` holder. Collapses those
 * three near-identical bodies into one.
 */
const idListSeriesByList = new Map<string, { ids: string[] }>();

function renderIdListNav<S extends { ids: string[] }>(
  listId: string,
  series: S,
  onSelect: (index: number, series: S) => void
) {
  idListSeriesByList.set(listId, series);
  const list = document.getElementById(listId);
  if (!list) return;

  list.innerHTML = series.ids.map((id, index) => (
    `<li><a href="#" data-sns="${index}"><i class="submenu-dot" aria-hidden="true"></i>${id}</a></li>`
  )).join('');

  if (list.dataset.sarkartRouted === 'true') return;
  list.dataset.sarkartRouted = 'true';

  list.addEventListener('click', (event) => {
    const link = (event.target as Element | null)?.closest?.('a') as HTMLAnchorElement | null;
    const current = idListSeriesByList.get(listId) as S | undefined;
    if (!link || !current) return;
    event.preventDefault();
    window.chartPage?.();
    onSelect(Number(link.dataset.sns || 0), current);
  });
}

// -- CPU ----------------------------------------------------------------

function renderCpuChart(coreId: string) {
  displayTitle(`CPU-${coreId}`);
  window.printChart?.('containerA', 0, null, `Percentage of CPU-${coreId} utilization at the user level [application] (%usr)`, 10, '#cc6699', getCPU(coreId, 2));
  window.printChart?.('containerB', 0, null, `Percentage of CPU-${coreId} utilization at the user level with nice priority (%nice)`, null, '#527bad', getCPU(coreId, 3));
  window.printChart?.('containerC', 0, 100, `Percentage of time that the CPU-${coreId} were idle with outstanding disk I/O request (%iowait)`, 10, '#DF5353', getCPU(coreId, 5));
  hideBlock('D');
}

// -- Load -----------------------------------------------------------------

function renderLoad() {
  displayTitle('Load');
  const section = requireSection('runq-sz');
  if (!section) return;
  const { header, sectionKey } = section;
  const runqCol = headerColumnIndex(header, 'runq-sz');
  const plistCol = headerColumnIndex(header, 'plist-sz');
  const ldavg1Col = headerColumnIndex(header, 'ldavg-1');
  const ldavg5Col = headerColumnIndex(header, 'ldavg-5');
  const ldavg15Col = headerColumnIndex(header, 'ldavg-15');
  const blockedCol = headerColumnIndex(header, 'blocked');

  window.printChart?.('containerA', 0, null, 'Run queue length [no. of tasks waiting for run time] (runq-sz)', null, '#cc6699', getGenericData(sectionKey, runqCol));
  window.printMultiChart?.('containerB', 'System Load Average', 'System Load Average', null, [
    { name: 'System load average for the last minute', data: getGenericData(sectionKey, ldavg1Col) },
    { name: 'System load average for the past 5 minutes', data: getGenericData(sectionKey, ldavg5Col) },
    { name: 'System load average for the past 15 minutes', data: getGenericData(sectionKey, ldavg15Col) }
  ]);
  window.printChart?.('containerC', null, null, 'Number of tasks in task list (plist-sz)', null, '#0099ff', getGenericData(sectionKey, plistCol));
  if (blockedCol > 1) {
    window.printChart?.('containerD', null, null, 'Number of tasks currently blocked, waiting for I/O to complete (blocked)', null, '#8d4654', getGenericData(sectionKey, blockedCol));
  } else {
    hideBlock('D');
  }
}

// -- Devices ----------------------------------------------------------------

function renderDeviceList(key: string) {
  renderIdListNav('ulDev', getDeviceSeries(key), (index, currentSeries) => {
    const deviceId = currentSeries.ids[index];
    const hostname = getHostname();

    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) pageTitle.textContent = `Block Transfer on ${deviceId} for ${hostname}`;
    const titleA = document.getElementById('containerATitle');
    if (titleA) titleA.textContent = 'Total number of transfers per second that were issued to physical devices';
    const titleB = document.getElementById('containerBTitle');
    if (titleB) titleB.textContent = 'Number of sectors read/written from/to the device';
    showNotes('B', 'The size of a sector is 512 bytes');
    const titleC = document.getElementById('containerCTitle');
    if (titleC) titleC.textContent = 'Average size/queue length for I/O requests that were issued to the device';
    const titleD = document.getElementById('containerDTitle');
    if (titleD) titleD.textContent = 'Average time/service-time/utilization for I/O requests that were issued to the device';
    showNotes('D', '%util - Device saturation occurs when this value is close to 100%');

    window.printMultiChart?.('containerA', `Transfers per second to ${deviceId}`, 'tps/s', null, [
      { name: 'tps/s', data: currentSeries.tps[index] }
    ]);
    window.printMultiChart?.('containerB', `Number of sectors read/written from/to to ${deviceId}`, 'rd_sec/wr_sec /s', null, [
      { name: 'rd_sec /s', data: currentSeries.readSectors[index] },
      { name: 'wr_sec /s', data: currentSeries.writeSectors[index] }
    ]);
    window.printMultiChart?.('containerC', `Average size/queue length to ${deviceId}`, 'avgRq-sz/avrgqu-sz/await/svctm/%util', null, [
      { name: 'The average size (in sectors) of the requests that were issued to the device (avrgrq-sz)', data: currentSeries.avgRqSize[index] },
      { name: 'The average queue length of the requests that were issued to the device (avrgqu-sz)', data: currentSeries.avgQueueSize[index] }
    ]);
    window.printMultiChart?.('containerD', `Average time/service time/utilization to ${deviceId}`, 'avgRq-sz/avrgqu-sz/await/svctm/%util', null, [
      { name: 'The average time [in ms] for I/O requests issued to the device to be served (await)', data: currentSeries.await[index] },
      { name: 'The average service time [in ms] for I/O requests that were issued to the device (svctm)', data: currentSeries.serviceTime[index] },
      { name: 'Percentage of CPU time bandwidth utilization for the device (util %)', data: currentSeries.utilPercent[index] }
    ]);
  });
}

// -- Memory -------------------------------------------------------------

function renderMemoryFree() {
  displayTitle('Memory Free');
  const section = requireSection('kbmemfree');
  if (!section) return;
  const { header, sectionKey } = section;
  const freeCol = headerColumnIndex(header, 'kbmemfree');
  const buffersCol = headerColumnIndex(header, 'kbbuffers');
  const cachedCol = headerColumnIndex(header, 'kbcached');

  window.printChart?.('containerA', null, null, 'Total Memory Free (kbmemfree+kbbuffers+kbcached)', 100, '#f45b5b', getMemoryFreeData(sectionKey, freeCol));
  window.printChart?.('containerB', 0, null, 'Amount of free memory available in kilobytes (kbmemfree)', 102400, '#ff0066', getGenericData(sectionKey, freeCol));
  window.printChart?.('containerC', 0, null, 'Amount of memory used as buffers by the kernel in kilobytes (kbbuffers)', 102400, '#166c7d', getGenericData(sectionKey, buffersCol));
  window.printChart?.('containerD', null, null, 'Amount of memory used to cache data by the kernel in kilobytes (kbcached)', null, '#527bad', getGenericData(sectionKey, cachedCol));
}

function renderMemoryUsage() {
  displayTitle('Memory Usage');
  const section = requireSection('kbmemfree');
  if (!section) return;
  const { header, sectionKey } = section;
  const memUsedPctCol = headerColumnIndex(header, '%memused');
  const memUsedCol = headerColumnIndex(header, 'kbmemused');
  const commitCol = headerColumnIndex(header, 'kbcommit');
  const commitPctCol = headerColumnIndex(header, '%commit');

  window.printChart?.('containerA', null, null, 'Percentage of used memory (%memused)', 100, '#55BF3B', getGenericData(sectionKey, memUsedPctCol));
  window.printChart?.('containerB', null, null, 'Amount of used memory in kilobytes (kbmemused)', null, '#527bad', getGenericData(sectionKey, memUsedCol));
  showNotes('B', 'kbmemused - This does not take into account memory used by the kernel');
  window.printChart?.('containerC', null, null, 'Amount of memory in kilobytes needed for current workload (kbcommit)', null, '#8d4654', getGenericData(sectionKey, commitCol));
  showNotes('C', 'kbcommit - This is an estimate of how much RAM/swap is needed to guarantee that there never is out of memory.');
  window.printChart?.('containerD', null, null, 'Percentage of memory needed for current workload [RAM+swap] (%commit)', null, '#f45b5b', getGenericData(sectionKey, commitPctCol));
  showNotes('D', '%commit - This number may be greater than 100% because the kernel usually overcommits memory.');
}

function renderSwapUsage() {
  displayTitle('Swap Usage');
  const section = requireSection('kbswpfree');
  if (!section) return;
  const { header, sectionKey } = section;
  const freeCol = headerColumnIndex(header, 'kbswpfree');
  const usedCol = headerColumnIndex(header, 'kbswpused');
  const usedPctCol = headerColumnIndex(header, '%swpused');
  const cadPctCol = headerColumnIndex(header, '%swpcad');

  window.printChart?.('containerA', 0, null, 'Amount of free swap space in kilobytes (kbswpfree)', null, '#166c7d', getGenericData(sectionKey, freeCol));
  window.printMultiChart?.('containerB', 'Amount of used swap space in kilobytes', 'kbswpused | kbswpcad ', null, [
    { name: 'Amount of used swap space in kilobytes (kbswpused)', data: getGenericData(sectionKey, usedCol) },
    { name: 'Amount of cached swap memory in kilobytes (kbswpcad)', data: getGenericData(sectionKey, cadPctCol) }
  ]);
  showNotes('B', "kbswpcad - This is memory that once was swapped out, is swapped back in but still also is in the swap area (if memory is needed it doesn't need to be swapped out again because it is already in the swap area. This saves I/O).");
  window.printMultiChart?.('containerC', 'Percentage of used swap space', '%swpused | %swpcad ', null, [
    { name: 'Percentage of used swap space (%swpused)', data: getGenericData(sectionKey, usedPctCol) },
    { name: 'Percentage of cached swap memory of used swap space (%swpcad)', data: getGenericData(sectionKey, cadPctCol) }
  ]);
  hideBlock('D');
}

// -- Interface Traffic / Errors ------------------------------------------

function renderInterfaceTrafficList(key: string) {
  renderIdListNav('ulInterfaceTraffic', getInterfaceTrafficSeries(key), (index, currentSeries) => {
    const ifaceId = currentSeries.ids[index];

    window.printMultiChart?.('containerA', `Packets received/transmitted per second on ${ifaceId}`, 'rxpck/s | txpck/s', null, [
      { name: 'Total number of packets received per second (rxpck/s)', data: currentSeries.rxpck[index] },
      { name: 'Total number of packets transmitted per second (txpck/s)', data: currentSeries.txpck[index] }
    ]);
    window.printMultiChart?.('containerB', `Data received/transmitted per second on ${ifaceId}`, 'rxkB/s | txkB/s', null, [
      { name: 'Total number of kilobytes received per second (rxkB/s)', data: currentSeries.rxkB[index] },
      { name: 'Total number of kilobytes transmitted per second (txkB/s)', data: currentSeries.txkB[index] }
    ]);
    window.printMultiChart?.('containerC', `Number of compressed/multicast packets received/transmitted per second on ${ifaceId}`, 'rxcmp/s | txcmp/s | rxmcst/s', null, [
      { name: 'Number of compressed packets received per second (rxcmp/s)', data: currentSeries.rxcmp[index] },
      { name: 'Number of compressed packets transmitted per second (txcmp/s)', data: currentSeries.txcmp[index] },
      { name: 'Number of multicast packets received per second (rxmcst/s)', data: currentSeries.rxmcst[index] }
    ]);
    // Only 3 charts for this category. The legacy handler never cleared
    // slot D either, so it could show stale content left over from a
    // previously-viewed 4-chart category (e.g. Devices) in the same
    // session — fixed here rather than reproduced.
    hideBlock('D');
  });
}

function renderInterfaceErrorList(key: string) {
  renderIdListNav('ulInterfaceErrors', getInterfaceErrorSeries(key), (index, currentSeries) => {
    const ifaceId = currentSeries.ids[index];

    window.printMultiChart?.('containerA', `Total number of bad packets received per second on ${ifaceId}`, 'rxerr/s | txerr/s | coll/s', null, [
      { name: 'Total number of bad packets received per second (rxerr/s)', data: currentSeries.rxerr[index] },
      { name: 'Total number of errors that happened per second while transmitting packets (txerr/s)', data: currentSeries.txerr[index] },
      { name: 'Number of collisions that happened per second while transmitting packets (coll/s)', data: currentSeries.coll[index] }
    ]);
    window.printMultiChart?.('containerB', `Number of received/transmitted packets dropped per second from linux buffers on ${ifaceId}`, 'rxdrop/s | txdrop/s | txcarr/s', null, [
      { name: 'Number of received packets dropped per second because of a lack of space in linux buffers (rxdrop/s)', data: currentSeries.rxdrop[index] },
      { name: 'Number of transmitted packets dropped per second because of a lack of space in linux buffers (txdrop/s)', data: currentSeries.txdrop[index] },
      { name: 'Number of carrier-errors that happened per second while transmitting packets (txcarr/s)', data: currentSeries.txcarr[index] }
    ]);
    window.printMultiChart?.('containerC', `Number of [frame alignment/FIFO overrun] errors per second on received packets on ${ifaceId}`, 'rxfram/s | rxfifo/s | txfifo/s', null, [
      { name: 'Number of frame alignment errors that happened per second on received packets (rxfram/s)', data: currentSeries.rxfram[index] },
      { name: 'Number of FIFO overrun errors that happened per second on received packets (rxfifo/s)', data: currentSeries.rxfifo[index] },
      { name: 'Number of FIFO overrun errors that happened per second on transmitted packets (txfifo/s)', data: currentSeries.txfifo[index] }
    ]);
    // See renderInterfaceTrafficList — only 3 charts for this category.
    hideBlock('D');
  });
}

// -- Processes ------------------------------------------------------------

function renderProcesses() {
  displayTitle('Processes');

  const section = requireSection('proc/s');
  if (section) {
    const { header, sectionKey } = section;
    const procCol = headerColumnIndex(header, 'proc/s');
    const cswchCol = headerColumnIndex(header, 'cswch/s');
    window.printChart?.('containerA', 0, null, 'Total number of tasks created per second (proc/s)', 10, '#8d4654', getGenericData(sectionKey, procCol));
    window.printChart?.('containerB', 0, null, 'Total number of context switches per second (cswch/s)', 100, '#8085e9', getGenericData(sectionKey, cswchCol));
    hideBlock('D');
  }

  const intrHeader = grepHeader('INTR');
  if (intrHeader !== null) {
    const sectionKey = headerSectionKey(intrHeader);
    const intrCol = headerColumnIndex(intrHeader, 'intr/s');
    window.printChart?.('containerC', 0, null, 'Total number of interrupts received per second (intr/s)', 100, '#55BF3B', getInterrupts(sectionKey, intrCol));
  } else {
    hideBlock('C');
  }
}

// -- Swapping ---------------------------------------------------------------

function renderSwapping() {
  displayTitle('Swapping');
  const section = requireSection('pswpin/s');
  if (!section) return;
  const { header, sectionKey } = section;
  const inCol = headerColumnIndex(header, 'pswpin/s');
  const outCol = headerColumnIndex(header, 'pswpout/s');
  window.printChart?.('containerA', 0, null, 'Total number of swap pages the system brought in per second (pswpin/s)', null, '#55BF3B', getGenericData(sectionKey, inCol));
  window.printChart?.('containerB', 0, null, 'Total number of swap pages the system brought out per second (pswpout/s)', null, '#8085e9', getGenericData(sectionKey, outCol));
  hideBlock('C');
  hideBlock('D');
}

// -- Paging Activity ---------------------------------------------------------

function renderPaging() {
  displayTitle('System Paging');

  window.printMultiChart?.('containerA', 'Number of system pages on disk', 'pgpgin/s,pgpgout/s', 1000, [
    { name: 'System Paged in from disk (pgpgin/s)', data: getGenericData('pgpgin/s-pgpgout/s', 1) },
    { name: 'System Paged out to disk (pgpgout/s)', data: getGenericData('pgpgin/s-pgpgout/s', 2) }
  ]);
  window.printMultiChart?.('containerB', 'Number of system page faults', 'fault/s,majflt/s', 1000, [
    { name: 'Number of page faults [major + minor] (fault/s)', data: getGenericData('pgpgin/s-pgpgout/s', 3) },
    { name: 'Number of major faults (majflt/s)', data: getGenericData('pgpgin/s-pgpgout/s', 4) }
  ]);
  window.printMultiChart?.('containerC', 'Number of system pages on free list', 'pgfree/s,pgscank/s,pgscand/s,pgsteal/s', 1000, [
    { name: 'Number of pages placed on the free list by the system (pgfree/s)', data: getGenericData('pgpgin/s-pgpgout/s', 5) },
    { name: 'Number of pages scanned by the kswapd daemon (pgscank/s)', data: getGenericData('pgpgin/s-pgpgout/s', 6) },
    { name: 'Number of pages scanned directly (pgscand/s)', data: getGenericData('pgpgin/s-pgpgout/s', 7) },
    { name: 'Number of pages the system has reclaimed from [page & swap] cache (pgsteal/s)', data: getGenericData('pgpgin/s-pgpgout/s', 8) }
  ]);
  window.printChart?.('containerD', 0, 100, 'Metric of efficiency of page reclaim (%vmeff)', null, '#8085e9', getGenericData('pgpgin/s-pgpgout/s', 9));
  showNotes('D', '%vmeff - Calculated as pgsteal / pgscan, this is a metric of the efficiency of page reclaim. If it is near 100% then almost every page coming off the tail of the inactive list is being reaped. If it gets too low (e.g. less than 30%) then the virtual memory is having some difficulty. This field is displayed as zero if no pages have been scanned during the interval of time.');
}

// -- Page (Linux frmpg/bufpg/campg) ------------------------------------------

function renderPage() {
  displayTitle('Page');
  window.printChart?.('containerA', null, null, 'Number of memory pages freed per second (frmpg/s)', 100, '#166c7d', getGenericData('frmpg/s-bufpg/s', 1));
  window.printChart?.('containerB', null, null, 'Number of additional memory pages used as buffers per second (bufpg/s)', null, '#8085e9', getGenericData('frmpg/s-bufpg/s', 2));
  window.printChart?.('containerC', null, null, 'Number of additional memory pages cached per second (campg/s)', 100, '#90ee7e', getGenericData('frmpg/s-bufpg/s', 3));
  hideBlock('D');
}

// -- I/O ----------------------------------------------------------------

function renderIO() {
  displayTitle('IO');
  const section = requireSection('tps');
  if (!section) return;
  const { header, sectionKey } = section;
  const tpsCol = headerColumnIndex(header, 'tps');
  const rtpsCol = headerColumnIndex(header, 'rtps');
  const wtpsCol = headerColumnIndex(header, 'wtps');
  const breadCol = headerColumnIndex(header, 'bread/s');
  const bwrtnCol = headerColumnIndex(header, 'bwrtn/s');
  window.printChart?.('containerA', 0, null, 'Total number of transfers per second that were issued to physical devices (tps)', 100, '#166c7d', getGenericData(sectionKey, tpsCol));
  window.printMultiChart?.('containerB', 'Total amount of data read/write from/to the devices in blocks per second', 'bread/s | bwrtn/s', 1000, [
    { name: 'Total amount of data read from the devices in blocks per second (bread/s)', data: getGenericData(sectionKey, breadCol) },
    { name: 'Total amount of data written to the devices in blocks per second (bwrtn/s)', data: getGenericData(sectionKey, bwrtnCol) }
  ]);
  showNotes('B', 'bread/s - Blocks are equivalent to sectors with 2.4 kernels and newer and therefore have a size of 512 bytes. With older kernels, a block is of indeterminate size');
  window.printMultiChart?.('containerC', 'Total number of read/write requests per second issued to physical devices', 'rtps/wtps', 100, [
    { name: 'Total number of read requests per second (rtps)', data: getGenericData(sectionKey, rtpsCol) },
    { name: 'Total number of write requests per second (wtps)', data: getGenericData(sectionKey, wtpsCol) }
  ]);
  hideBlock('D');
}

// -- Sockets ------------------------------------------------------------

function renderSockets() {
  displayTitle('Sockets');
  const section = requireSection('totsck');
  if (!section) return;
  const { header, sectionKey } = section;
  const totsckCol = headerColumnIndex(header, 'totsck');
  const ipFragCol = headerColumnIndex(header, 'ip-frag');
  const tcpsckCol = headerColumnIndex(header, 'tcpsck');
  const udpsckCol = headerColumnIndex(header, 'udpsck');
  const rawsckCol = headerColumnIndex(header, 'rawsck');

  window.printChart?.('containerA', 100, null, 'Total number of sockets used by the system (totsck)', null, '#166c7d', getGenericData(sectionKey, totsckCol));
  window.printChart?.('containerB', null, null, 'Number of IP fragments currently in use (ip-frag)', null, '#527bad', getGenericData(sectionKey, ipFragCol));
  window.printMultiChart?.('containerC', 'Number of Sockets currently in use', 'tcp/udp/raw sockets', 1, [
    { name: 'Number of TCP sockets (tcpsck)', data: getGenericData(sectionKey, tcpsckCol) },
    { name: 'Number of UDP sockets (udpsck)', data: getGenericData(sectionKey, udpsckCol) },
    { name: 'Number of RAW sockets (rawsck)', data: getGenericData(sectionKey, rawsckCol) }
  ]);
  hideBlock('D');
}

// -- NFS Client / Server ------------------------------------------------

function renderNfsClient() {
  displayTitle('NFS Client');
  window.printMultiChart?.('containerA', 'Number of RPC requests made per second', 'call/s | retrans/s', null, [
    { name: 'Number of RPC requests made per second (call/s)', data: getGenericData('call/s-retrans/s', 1) },
    { name: 'The total number of segments retransmitted per second (retrans/s)', data: getGenericData('call/s-retrans/s', 2) }
  ]);
  window.printMultiChart?.('containerB', 'Number of "read/write" RPC calls made per second', 'read/s | write/s', null, [
    { name: "Number of 'read' RPC calls made per second (read/s)", data: getGenericData('call/s-retrans/s', 3) },
    { name: "Number of 'write' RPC calls made per second (write/s)", data: getGenericData('call/s-retrans/s', 4) }
  ]);
  window.printMultiChart?.('containerC', 'Number of "access/getatt" RPC calls made per second', 'access/s getatt/s', null, [
    { name: "Number of 'access' RPC calls made per second (access/s)", data: getGenericData('call/s-retrans/s', 5) },
    { name: "Number of 'getattr' RPC calls made per second (getatt/s)", data: getGenericData('call/s-retrans/s', 6) }
  ]);
  hideBlock('D');
}

function renderNfsServer() {
  displayTitle('NFS Server');
  window.printMultiChart?.('containerA', 'Number of RPC requests received per second', 'scall/badcall/saccess/sgetatt per second', null, [
    { name: 'Number of RPC requests received per second (scall/s)', data: getGenericData('scall/s-badcall/s', 1) },
    { name: 'Number of bad RPC requests received per second (badcall/s)', data: getGenericData('scall/s-badcall/s', 2) },
    { name: "Number of 'access' RPC calls received per second (saccess/s)", data: getGenericData('scall/s-badcall/s', 10) },
    { name: "Number of 'getattr' RPC calls received per second (sgetatt/s)", data: getGenericData('scall/s-badcall/s', 11) }
  ]);
  window.printMultiChart?.('containerB', 'Number of network packets received per second', 'packet/udp/tcp per second', null, [
    { name: 'Number of network packets received per second (packet/s)', data: getGenericData('scall/s-badcall/s', 3) },
    { name: 'Number of UDP packets received per second (udp/s)', data: getGenericData('scall/s-badcall/s', 4) },
    { name: 'Number of TCP packets received per second (tcp/s)', data: getGenericData('scall/s-badcall/s', 5) }
  ]);
  window.printMultiChart?.('containerC', 'Number of "hit/miss/sread/swrite" received per second', 'hit/miss/sread/swrite per second', null, [
    { name: 'Number of reply cache hits per second (hit/s)', data: getGenericData('scall/s-badcall/s', 6) },
    { name: 'Number of reply cache misses per second (miss/s)', data: getGenericData('scall/s-badcall/s', 7) },
    { name: "Number of 'read' RPC calls received per second (sread/s)", data: getGenericData('scall/s-badcall/s', 8) },
    { name: "Number of 'write' RPC calls received per second (swrite/s)", data: getGenericData('scall/s-badcall/s', 9) }
  ]);
  hideBlock('D');
}

function install() {
  window.getCPUchart = renderCpuChart;
  window.getDevices = (key: string) => renderDeviceList(key);
  window.getInterfaceTraffic = (key: string) => renderInterfaceTrafficList(key);
  window.getInterfaceErrors = (key: string) => renderInterfaceErrorList(key);

  takeOverClick('btnLoad', renderLoad);
  takeOverClick('btnMemFree', renderMemoryFree);
  takeOverClick('btnMemUsg', renderMemoryUsage);
  takeOverClick('btnSwapUsg', renderSwapUsage);
  takeOverClick('btnProcs', renderProcesses);
  takeOverClick('btnSwap', renderSwapping);
  takeOverClick('btnPaging', renderPaging);
  takeOverClick('btnPage', renderPage);
  takeOverClick('btnIO', renderIO);
  takeOverClick('btnSockets', renderSockets);
  takeOverClick('btnNFSClient', renderNfsClient);
  takeOverClick('btnNFSServer', renderNfsServer);
}

export function ChartRouterBridge() {
  useEffect(() => {
    // The legacy engine (sarkart-v1.0.0.min.js) that used to bind its own
    // `$("#btnCPU").click(...)` handlers and define window.getCPUchart /
    // getDevices / getInterfaceTraffic / getInterfaceErrors has been
    // removed, so there's no longer a late-loading script to race. The
    // nav links this routes are Preact-rendered and present at mount, so
    // install directly with a plain addEventListener (see takeOverClick).
    install();
  }, []);

  return null;
}
