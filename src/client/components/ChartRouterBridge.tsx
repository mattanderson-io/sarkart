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
import { displayTitle, getHostname, hideBlock, setChartInfo, setChartInfos, showBlock, showNotes } from '../lib/sarEngine';
import { chartInfo } from '../lib/metricInfo';

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

  const scope = coreId === 'all' ? 'all cores combined' : `core ${coreId}`;
  setChartInfos({
    A: chartInfo(`How busy the CPU (${scope}) is running normal application code, as a percentage of its total capacity.`, ['%usr']),
    B: chartInfo(`Application CPU time (${scope}) that came from low-priority "niced" programs.`, ['%nice']),
    C: chartInfo(`How often the CPU (${scope}) was idle only because it was waiting on storage.`, ['%iowait'], 'High %iowait usually means slow storage, not a lack of CPU. Note: %usr, %nice and %iowait are three slices of the same 100%; the remaining time is system, idle, and other categories not charted here.')
  });
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

  setChartInfos({
    A: chartInfo('How many tasks are ready to run but waiting for a free CPU at each sample.', ['runq-sz'], 'Compare against the CPU core count: a run queue that stays above your core count means the machine is CPU-bound.'),
    B: chartInfo('The classic Unix "load average" over three time windows, so you can tell a brief spike from sustained pressure.', ['ldavg-1', 'ldavg-5', 'ldavg-15'], 'Rule of thumb: a load average roughly equal to the number of CPU cores means fully loaded; well above it means work is backing up.'),
    C: chartInfo('The total number of tasks (processes and threads) present on the system.', ['plist-sz']),
    D: blockedCol > 1 ? chartInfo('Tasks stuck waiting for I/O to finish before they can run.', ['blocked'], 'A steady stream of blocked tasks usually points to a storage or network bottleneck.') : null
  });
}

// -- Devices ----------------------------------------------------------------

function renderDeviceList(key: string) {
  renderIdListNav('ulDev', getDeviceSeries(key), (index, currentSeries) => {
    const deviceId = currentSeries.ids[index];
    const hostname = getHostname();

    const sectors = currentSeries.throughputUnit === 'sectors';

    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) pageTitle.textContent = `Block Transfer on ${deviceId} for ${hostname}`;

    window.printMultiChart?.('containerA', `Transfers per second to ${deviceId}`, 'tps/s', null, [
      { name: 'I/O transfers per second (tps)', data: currentSeries.tps[index] }
    ]);

    const readWriteTitle = sectors
      ? `Sectors read/written per second on ${deviceId}`
      : `Data read/written per second on ${deviceId}`;
    window.printMultiChart?.('containerB', readWriteTitle, sectors ? 'rd_sec/s | wr_sec/s' : 'rkB/s | wkB/s', null, [
      { name: sectors ? 'Sectors read per second (rd_sec/s)' : 'Kilobytes read per second (rkB/s)', data: currentSeries.readSectors[index] },
      { name: sectors ? 'Sectors written per second (wr_sec/s)' : 'Kilobytes written per second (wkB/s)', data: currentSeries.writeSectors[index] }
    ]);
    if (sectors) showNotes('B', 'The size of a sector is 512 bytes');

    window.printMultiChart?.('containerC', `Average request size/queue length to ${deviceId}`, sectors ? 'avgrq-sz | avgqu-sz' : 'areq-sz | aqu-sz', null, [
      { name: 'Average size of the I/O requests issued to the device', data: currentSeries.avgRqSize[index] },
      { name: 'Average queue length of the requests issued to the device', data: currentSeries.avgQueueSize[index] }
    ]);

    const latencySeries = [
      { name: 'Average request time — waiting + being served (await, ms)', data: currentSeries.await[index] }
    ];
    if (currentSeries.hasServiceTime) {
      latencySeries.push({ name: 'Average device service time (svctm, ms)', data: currentSeries.serviceTime[index] });
    }
    latencySeries.push({ name: 'Percentage of time the device was busy (%util)', data: currentSeries.utilPercent[index] });
    window.printMultiChart?.('containerD', `Latency and utilization for ${deviceId}`, currentSeries.hasServiceTime ? 'await / svctm / %util' : 'await / %util', null, latencySeries);
    showNotes('D', '%util - Device saturation occurs when this value is close to 100%');

    setChartInfos({
      A: chartInfo(`How many I/O operations per second the disk device "${deviceId}" completed.`, ['dev-tps']),
      B: chartInfo(`How much data "${deviceId}" read and wrote per second.`, ['dev-throughput']),
      C: chartInfo(`Request size and how deep the device's I/O queue got for "${deviceId}".`, ['dev-queue']),
      D: chartInfo(`Latency and how saturated "${deviceId}" was.`, ['dev-latency'], 'If %util sits near 100% while await climbs, this disk is the bottleneck.')
    });
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

  setChartInfos({
    A: chartInfo('Truly reclaimable memory: free RAM plus the buffer and cache memory the kernel will hand back on demand. A better "how much room is left" gauge than free memory alone.', ['kbmemfree', 'kbbuffers', 'kbcached'], 'On Linux, low free memory is normal because spare RAM is used for cache. Watch this combined total instead.'),
    B: chartInfo('RAM that is completely unused.', ['kbmemfree']),
    C: chartInfo('RAM the kernel is using as buffers for disk blocks and filesystem metadata.', ['kbbuffers']),
    D: chartInfo('RAM holding cached file data so repeat reads skip the disk.', ['kbcached'])
  });
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

  setChartInfos({
    A: chartInfo('Percentage of physical RAM in use.', ['%memused'], 'A high value is normal on Linux because cache and buffers count as "used". Judge real pressure by watching swap activity too.'),
    B: chartInfo('The amount of RAM in use, in kilobytes.', ['kbmemused']),
    C: chartInfo('How much memory the current workload has actually committed to (asked for).', ['kbcommit']),
    D: chartInfo('Committed memory as a percentage of total RAM plus swap.', ['%commit'])
  });
}

function renderSwapUsage() {
  displayTitle('Swap Usage');
  const section = requireSection('kbswpfree');
  if (!section) return;
  const { header, sectionKey } = section;
  const freeCol = headerColumnIndex(header, 'kbswpfree');
  const usedCol = headerColumnIndex(header, 'kbswpused');
  const cadCol = headerColumnIndex(header, 'kbswpcad');
  const usedPctCol = headerColumnIndex(header, '%swpused');
  const cadPctCol = headerColumnIndex(header, '%swpcad');

  window.printChart?.('containerA', 0, null, 'Amount of free swap space in kilobytes (kbswpfree)', null, '#166c7d', getGenericData(sectionKey, freeCol));
  window.printMultiChart?.('containerB', 'Amount of used swap space in kilobytes', 'kbswpused | kbswpcad ', null, [
    { name: 'Amount of used swap space in kilobytes (kbswpused)', data: getGenericData(sectionKey, usedCol) },
    { name: 'Amount of cached swap memory in kilobytes (kbswpcad)', data: getGenericData(sectionKey, cadCol) }
  ]);
  showNotes('B', "kbswpcad - This is memory that once was swapped out, is swapped back in but still also is in the swap area (if memory is needed it doesn't need to be swapped out again because it is already in the swap area. This saves I/O).");
  window.printMultiChart?.('containerC', 'Percentage of used swap space', '%swpused | %swpcad ', null, [
    { name: 'Percentage of used swap space (%swpused)', data: getGenericData(sectionKey, usedPctCol) },
    { name: 'Percentage of cached swap memory of used swap space (%swpcad)', data: getGenericData(sectionKey, cadPctCol) }
  ]);
  hideBlock('D');

  setChartInfos({
    A: chartInfo('How much swap space (disk used as overflow for RAM) is still free.', ['kbswpfree']),
    B: chartInfo('Swap space in use, plus the portion that is "cached" (kept in both RAM and swap at once).', ['kbswpused', 'kbswpcad'], 'Steadily rising used swap is a sign the system is short on RAM.'),
    C: chartInfo('The same used and cached swap figures expressed as percentages of total swap.', ['%swpused', '%swpcad']),
    D: null
  });
}

// -- Interface Traffic / Errors ------------------------------------------

function renderInterfaceTrafficList(key: string) {
  renderIdListNav('ulInterfaceTraffic', getInterfaceTrafficSeries(key), (index, currentSeries) => {
    const ifaceId = currentSeries.ids[index];

    // Signal to NetworkUnitBridge that these are genuine network charts, so its
    // Mbps/Gbps unit conversion + toolbar apply here (and only here).
    window.__sarkartNetTrafficRender = true;
    try {
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
    } finally {
      window.__sarkartNetTrafficRender = false;
    }
    // Only 3 charts for this category. The legacy handler never cleared
    // slot D either, so it could show stale content left over from a
    // previously-viewed 4-chart category (e.g. Devices) in the same
    // session — fixed here rather than reproduced.
    hideBlock('D');

    setChartInfos({
      A: chartInfo(`Packet rate in and out of "${ifaceId}". Watch alongside the data-rate chart: lots of tiny packets can strain a host even at low bandwidth.`, ['rxpck/s', 'txpck/s']),
      B: chartInfo(`Actual bandwidth used by "${ifaceId}" in each direction.`, ['rxkB/s', 'txkB/s'], 'The "Display units" control above the chart switches the unit (KB/s, MB/s, Mbps, Gbps, or % of a link speed). The underlying SAR data is in kilobytes per second.'),
      C: chartInfo(`Less common traffic on "${ifaceId}": compressed and multicast packets.`, ['rxcmp/s', 'txcmp/s', 'rxmcst/s']),
      D: null
    });
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

    setChartInfos({
      A: chartInfo(`Transmission faults and collisions on "${ifaceId}". On a healthy modern switched network these should stay near zero.`, ['rxerr/s', 'txerr/s', 'coll/s'], 'A steady error rate usually means a physical-layer problem: bad cable, failing NIC, or a duplex mismatch.'),
      B: chartInfo(`Packets dropped on "${ifaceId}" because buffers were full, plus carrier (link-signal) errors.`, ['rxdrop/s', 'txdrop/s', 'txcarr/s'], 'Drops often mean the host cannot keep up with traffic; carrier errors point to a flapping link.'),
      C: chartInfo(`Low-level framing and buffer-overrun errors on "${ifaceId}".`, ['rxfram/s', 'rxfifo/s', 'txfifo/s']),
      D: null
    });
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
    setChartInfos({
      A: chartInfo('The rate at which new processes are being created.', ['proc/s'], 'Spikes can mean a fork-heavy workload — or a process crashing and restarting in a loop.'),
      B: chartInfo('How often the CPU switched from one task to another.', ['cswch/s'], 'Very high rates can mean the system is spending more effort juggling tasks than doing useful work.')
    });
  }

  const intrHeader = grepHeader('INTR');
  if (intrHeader !== null) {
    const sectionKey = headerSectionKey(intrHeader);
    const intrCol = headerColumnIndex(intrHeader, 'intr/s');
    window.printChart?.('containerC', 0, null, 'Total number of interrupts received per second (intr/s)', 100, '#55BF3B', getInterrupts(sectionKey, intrCol));
    setChartInfo('containerC', chartInfo('Hardware interrupts serviced per second across all CPUs.', ['intr/s'], 'Interrupts are signals from devices (network cards, disks, timers) asking the CPU for attention.'));
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

  setChartInfos({
    A: chartInfo('Memory pages read back from swap into RAM.', ['pswpin/s'], 'Swap lives on disk and is far slower than RAM. Sustained swap-in means the system is actively pulling data back off disk to run.'),
    B: chartInfo('Memory pages written from RAM out to swap.', ['pswpout/s'], 'Sustained swap-out is a classic sign that RAM is under real pressure.')
  });
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

  setChartInfos({
    A: chartInfo('Data moved between disk and memory for normal file/program access (not swapping).', ['pgpgin/s', 'pgpgout/s'], 'This is routine activity: loading program code and reading/writing files. Do not confuse it with the Swapping charts.'),
    B: chartInfo('Page faults — moments when a program touches memory that must first be set up or fetched.', ['fault/s', 'majflt/s'], 'Minor faults are cheap and normal. Major faults hit the disk, so a high major-fault rate slows things down.'),
    C: chartInfo('Memory-reclaim activity: pages freed, and pages scanned looking for memory to reclaim.', ['pgfree/s', 'pgscank/s', 'pgscand/s', 'pgsteal/s'], 'Heavy scanning — especially direct scanning — is a sign the system is working hard to free memory.'),
    D: chartInfo('How efficient that memory reclaim is.', ['%vmeff'], 'Near 100% is healthy; consistently under ~30% means the memory system is struggling.')
  });
}

// -- Page (Linux frmpg/bufpg/campg) ------------------------------------------

function renderPage() {
  displayTitle('Page');
  window.printChart?.('containerA', null, null, 'Number of memory pages freed per second (frmpg/s)', 100, '#166c7d', getGenericData('frmpg/s-bufpg/s', 1));
  window.printChart?.('containerB', null, null, 'Number of additional memory pages used as buffers per second (bufpg/s)', null, '#8085e9', getGenericData('frmpg/s-bufpg/s', 2));
  window.printChart?.('containerC', null, null, 'Number of additional memory pages cached per second (campg/s)', 100, '#90ee7e', getGenericData('frmpg/s-bufpg/s', 3));
  hideBlock('D');

  setChartInfos({
    A: chartInfo('Net change in freed memory pages each second.', ['frmpg/s'], 'These are net values: a negative number means the system allocated more memory than it freed during the interval.'),
    B: chartInfo('Net change in memory pages used as disk buffers each second.', ['bufpg/s']),
    C: chartInfo('Net change in memory pages used for the file cache each second.', ['campg/s'])
  });
}

// -- I/O ----------------------------------------------------------------

function renderIO() {
  displayTitle('I/O');
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

  setChartInfos({
    A: chartInfo('Total storage I/O operations per second across all devices combined. This is the whole-system view; the per-device Devices pages break it down disk by disk.', ['tps']),
    B: chartInfo('How much data the system read from and wrote to storage per second.', ['bread/s', 'bwrtn/s']),
    C: chartInfo('The same activity split into read versus write operations per second.', ['rtps', 'wtps']),
    D: null
  });
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

  setChartInfos({
    A: chartInfo('Total open network sockets across all protocols — a quick gauge of overall connection load.', ['totsck']),
    B: chartInfo('IP packet fragments currently queued.', ['ip-frag'], 'A high count can indicate MTU or fragmentation problems on the network path.'),
    C: chartInfo('Open sockets broken down by protocol.', ['tcpsck', 'udpsck', 'rawsck']),
    D: null
  });
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

  setChartInfos({
    A: chartInfo('This host acting as an NFS client: total requests it sent to NFS servers, and how many had to be retransmitted.', ['call/s', 'retrans/s'], 'Retransmits above roughly zero suggest network loss or an overloaded server.'),
    B: chartInfo('How much of the NFS traffic is reading versus writing file data.', ['read/s', 'write/s']),
    C: chartInfo('Metadata-style NFS calls: permission checks and attribute lookups.', ['access/s', 'getatt/s']),
    D: null
  });
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

  setChartInfos({
    A: chartInfo('This host acting as an NFS server: total requests received, how many were bad, and the access/attribute calls it served.', ['scall/s', 'badcall/s', 'saccess/s', 'sgetatt/s'], 'A rising bad-request rate can indicate a misbehaving client or an authentication problem.'),
    B: chartInfo('Inbound NFS network packets, split by transport protocol.', ['packet/s', 'udp/s', 'tcp/s']),
    C: chartInfo('Reply-cache effectiveness plus the read/write calls served to clients.', ['hit/s', 'miss/s', 'sread/s', 'swrite/s'], 'Reply-cache hits let the server skip repeating work for duplicate requests.'),
    D: null
  });
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
