/**
 * Plain-English explanations for the SAR metrics SARkart charts.
 *
 * Audience: someone comfortable with general IT concepts (a recent IT
 * graduate) but NOT a Linux internals or `sar`/sysstat expert. Each entry
 * defines the raw SAR field in one or two sentences, favouring "what it means
 * in practice" over kernel jargon. Definitions are cross-checked against the
 * sysstat man pages (sar(1)).
 *
 * `chartInfo()` composes these into the HTML shown in a chart header's info
 * popover (see `sarEngine.setChartInfo` + `ChartInfoBridge`). All text here is
 * developer-authored constants — no user/file data is interpolated — but the
 * builder still HTML-escapes every value so a stray `<`/`&` can never break the
 * markup.
 */

type Metric = { name: string; desc: string };

/** Canonical SAR field token -> friendly name + plain-English definition. */
const METRICS: Record<string, Metric> = {
  // -- CPU (sar -u / -P) ----------------------------------------------------
  '%usr': {
    name: 'User CPU time',
    desc: 'Percentage of CPU capacity spent running normal application code (user space), not counting low-priority "niced" tasks. Sustained high values mean the CPU is busy doing real work for programs.'
  },
  '%nice': {
    name: 'Niced user CPU time',
    desc: 'Percentage of CPU capacity spent on user programs that were started at a lowered ("nice") priority so they yield to more important work. Usually small; it rises when background or batch jobs run.'
  },
  '%iowait': {
    name: 'I/O wait',
    desc: 'Percentage of time the CPU sat idle specifically because it was waiting for disk or other storage I/O to finish. Consistently high values usually point to slow or overloaded storage rather than a CPU shortage.'
  },

  // -- Load (sar -q) --------------------------------------------------------
  'runq-sz': {
    name: 'Run queue length',
    desc: 'Number of tasks that are ready to run and waiting for a free CPU. If this stays higher than the number of CPU cores, work is queuing up and the machine is CPU-bound.'
  },
  'plist-sz': {
    name: 'Task list size',
    desc: 'Total number of tasks (processes and threads) that exist on the system, whether running, sleeping, or waiting. A useful gauge of overall system size and process churn.'
  },
  'ldavg-1': {
    name: 'Load average (1 min)',
    desc: 'Average number of tasks either running or waiting to run, measured over the last minute. Compare it to the CPU core count: roughly equal to the cores means fully loaded, well above means a backlog.'
  },
  'ldavg-5': {
    name: 'Load average (5 min)',
    desc: 'Same load measure averaged over the last 5 minutes. Smooths out short spikes so you can see a sustained trend.'
  },
  'ldavg-15': {
    name: 'Load average (15 min)',
    desc: 'Same load measure averaged over the last 15 minutes. Best for spotting long-running pressure versus a brief burst.'
  },
  blocked: {
    name: 'Blocked tasks',
    desc: 'Number of tasks currently stuck waiting for I/O to complete (they cannot run until it finishes). A steady stream here often means a storage or network bottleneck.'
  },

  // -- Memory free (sar -r) -------------------------------------------------
  kbmemfree: {
    name: 'Free memory',
    desc: 'Amount of RAM, in kilobytes, that is completely unused. On Linux this is often low by design, because the kernel puts spare RAM to work as cache (see cached/buffers).'
  },
  kbbuffers: {
    name: 'Buffer memory',
    desc: 'RAM, in kilobytes, the kernel uses as temporary buffers for raw disk blocks and filesystem metadata. This is reclaimable — the system hands it back to programs when they need it.'
  },
  kbcached: {
    name: 'Page cache',
    desc: 'RAM, in kilobytes, holding cached copies of recently used file data so repeat reads avoid the disk. Also reclaimable, so it is not "lost" memory even though it looks used.'
  },

  // -- Memory usage (sar -r) ------------------------------------------------
  '%memused': {
    name: 'Memory used',
    desc: 'Percentage of physical RAM in use. Because Linux counts cache and buffers as "used", a high number is normal and healthy on its own — pair it with swap activity to judge real pressure.'
  },
  kbmemused: {
    name: 'Used memory',
    desc: 'Amount of RAM in use, in kilobytes (this figure does not include memory used by the kernel itself). Includes reclaimable cache and buffers.'
  },
  kbcommit: {
    name: 'Committed memory',
    desc: 'Estimate, in kilobytes, of how much RAM plus swap would be needed to satisfy every allocation the current workload has requested, guaranteeing it never runs out.'
  },
  '%commit': {
    name: 'Committed memory %',
    desc: 'Committed memory as a percentage of total RAM plus swap. It can exceed 100% because the kernel deliberately "overcommits", betting that programs will not all use everything they asked for at once.'
  },

  // -- Swap usage (sar -S) --------------------------------------------------
  kbswpfree: {
    name: 'Free swap',
    desc: 'Amount of swap space (disk used as overflow for RAM), in kilobytes, that is still free.'
  },
  kbswpused: {
    name: 'Used swap',
    desc: 'Amount of swap space currently in use, in kilobytes. Small, stable amounts are fine; a steadily climbing value means the system is running short on RAM.'
  },
  kbswpcad: {
    name: 'Cached swap',
    desc: 'Swap data, in kilobytes, that was paged back into RAM but still also kept in the swap area. Keeping both copies means the page can be dropped later without re-writing it to disk, saving I/O.'
  },
  '%swpused': {
    name: 'Swap used %',
    desc: 'Percentage of total swap space in use. Rising values usually signal memory pressure worth investigating.'
  },
  '%swpcad': {
    name: 'Cached swap %',
    desc: 'Percentage of the used swap space that is cached (present in both RAM and swap at the same time).'
  },

  // -- Processes & context switches (sar -w) / interrupts (sar -I) ----------
  'proc/s': {
    name: 'New tasks / sec',
    desc: 'Number of new tasks (processes) created per second. Sudden spikes can indicate a fork-heavy workload or a process that keeps crashing and restarting.'
  },
  'cswch/s': {
    name: 'Context switches / sec',
    desc: 'Number of times per second the CPU switched from one task to another. Very high rates can mean the system is spending effort juggling tasks instead of doing useful work.'
  },
  'intr/s': {
    name: 'Interrupts / sec',
    desc: 'Total hardware interrupts serviced per second across all CPUs. Interrupts are signals from devices (network cards, disks, timers) that need the CPU\u2019s attention.'
  },

  // -- Swapping (sar -W) ----------------------------------------------------
  'pswpin/s': {
    name: 'Pages swapped in / sec',
    desc: 'Number of memory pages per second read back from swap into RAM. Any sustained value means the system is actively pulling data off the (slow) swap disk to keep running.'
  },
  'pswpout/s': {
    name: 'Pages swapped out / sec',
    desc: 'Number of memory pages per second written from RAM out to swap. Sustained values are a classic sign that RAM is under real pressure.'
  },

  // -- Paging (sar -B) ------------------------------------------------------
  'pgpgin/s': {
    name: 'Paged in / sec',
    desc: 'Kilobytes per second the system read in from disk into memory (loading program code and file data). Normal background activity, not the same as swapping.'
  },
  'pgpgout/s': {
    name: 'Paged out / sec',
    desc: 'Kilobytes per second the system wrote from memory out to disk (for example flushing modified file data).'
  },
  'fault/s': {
    name: 'Page faults / sec',
    desc: 'Page faults per second (major + minor). A fault happens when a program touches memory that must first be set up or fetched. Minor faults are cheap; only major faults hit the disk.'
  },
  'majflt/s': {
    name: 'Major faults / sec',
    desc: 'Page faults per second that required reading from disk because the data was not already in RAM. These are expensive; a high rate slows programs noticeably.'
  },
  'pgfree/s': {
    name: 'Pages freed / sec',
    desc: 'Number of memory pages per second the kernel returned to the free pool so they can be reused.'
  },
  'pgscank/s': {
    name: 'Pages scanned (kswapd) / sec',
    desc: 'Pages per second the background reclaim daemon (kswapd) scanned looking for memory to free. Activity here means the kernel is working to reclaim RAM ahead of running out.'
  },
  'pgscand/s': {
    name: 'Pages scanned (direct) / sec',
    desc: 'Pages per second scanned directly by a program\u2019s own request because it needed memory immediately. Sustained direct scanning is a stronger sign of memory pressure than background scanning.'
  },
  'pgsteal/s': {
    name: 'Pages reclaimed / sec',
    desc: 'Pages per second the system reclaimed from the page and swap caches to satisfy new memory demands.'
  },
  '%vmeff': {
    name: 'Reclaim efficiency',
    desc: 'How efficiently memory reclaim is working (pages reclaimed \u00f7 pages scanned). Near 100% is healthy. Persistently low values (under ~30%) suggest the memory system is struggling. Shown as 0 when nothing was scanned.'
  },

  // -- Page stats (sar -B, frmpg/bufpg/campg) -------------------------------
  'frmpg/s': {
    name: 'Pages freed / sec (net)',
    desc: 'Net memory pages freed per second. A negative value means the system allocated more pages than it freed during the interval (memory use grew).'
  },
  'bufpg/s': {
    name: 'Buffer pages / sec (net)',
    desc: 'Net additional memory pages used as disk buffers per second. Negative means buffer memory shrank.'
  },
  'campg/s': {
    name: 'Cache pages / sec (net)',
    desc: 'Net additional memory pages used for the file cache per second. Negative means cached memory shrank.'
  },

  // -- I/O (sar -b) ---------------------------------------------------------
  tps: {
    name: 'Transfers / sec',
    desc: 'Total I/O transfers (requests) per second issued to the storage devices. Measures how many operations are happening, not how much data — see the throughput chart for volume.'
  },
  rtps: {
    name: 'Read requests / sec',
    desc: 'Total read requests per second sent to storage devices.'
  },
  wtps: {
    name: 'Write requests / sec',
    desc: 'Total write requests per second sent to storage devices.'
  },
  'bread/s': {
    name: 'Blocks read / sec',
    desc: 'Amount of data read from storage per second, measured in blocks (a block is 512 bytes on modern kernels).'
  },
  'bwrtn/s': {
    name: 'Blocks written / sec',
    desc: 'Amount of data written to storage per second, measured in blocks (512 bytes each on modern kernels).'
  },

  // -- Block devices (sar -d) ----------------------------------------------
  'dev-tps': {
    name: 'Transfers / sec',
    desc: 'I/O transfers (operations) per second completed by this specific disk device. Multiple logically adjacent requests can be merged into one transfer.'
  },
  'dev-throughput': {
    name: 'Read / write throughput',
    desc: 'How much data this device reads and writes per second. Modern sar reports this in kilobytes/sec; older versions report 512-byte sectors/sec.'
  },
  'dev-queue': {
    name: 'Request size & queue length',
    desc: 'Average size of each I/O request sent to the device, and the average number of requests waiting in its queue. A queue length that stays well above ~1 means requests are backing up faster than the disk can clear them.'
  },
  'dev-latency': {
    name: 'Latency & utilisation',
    desc: 'await = average time a request spends waiting in queue plus being served (ms); service time = time the device itself took (ms); %util = percentage of time the device was busy. A %util near 100% means the disk is saturated and is likely your bottleneck.'
  },

  // -- Network interface traffic (sar -n DEV) -------------------------------
  'rxpck/s': {
    name: 'Packets received / sec',
    desc: 'Network packets received per second on this interface. Pair it with the throughput chart: many tiny packets can stress a system even at low data rates.'
  },
  'txpck/s': {
    name: 'Packets sent / sec',
    desc: 'Network packets transmitted per second on this interface.'
  },
  'rxkB/s': {
    name: 'Data received / sec',
    desc: 'Inbound data rate (throughput) on this interface. SAR records it in kilobytes per second, but the chart can show KB/s, MB/s, Mbps, or Gbps — pick with the "Display units" control above the chart.'
  },
  'txkB/s': {
    name: 'Data sent / sec',
    desc: 'Outbound data rate (throughput) on this interface. SAR records it in kilobytes per second; use the "Display units" control above the chart to change how it is displayed.'
  },
  'rxcmp/s': {
    name: 'Compressed received / sec',
    desc: 'Compressed packets received per second (relevant on links that use hardware/link compression, such as some VPN or PPP setups).'
  },
  'txcmp/s': {
    name: 'Compressed sent / sec',
    desc: 'Compressed packets transmitted per second.'
  },
  'rxmcst/s': {
    name: 'Multicast received / sec',
    desc: 'Multicast packets received per second (traffic addressed to a group of hosts rather than a single one).'
  },

  // -- Network interface errors (sar -n EDEV) -------------------------------
  'rxerr/s': {
    name: 'Receive errors / sec',
    desc: 'Bad packets received per second. A steady rate points to a physical or driver problem such as a bad cable, failing NIC, or duplex mismatch.'
  },
  'txerr/s': {
    name: 'Transmit errors / sec',
    desc: 'Errors per second while sending packets. Like receive errors, these usually indicate a hardware or link-layer fault.'
  },
  'coll/s': {
    name: 'Collisions / sec',
    desc: 'Packet collisions per second while transmitting. Common on old half-duplex links; on modern switched networks this should be essentially zero.'
  },
  'rxdrop/s': {
    name: 'Received dropped / sec',
    desc: 'Received packets dropped per second because the system ran out of buffer space to hold them. Often a sign the host cannot keep up with incoming traffic.'
  },
  'txdrop/s': {
    name: 'Transmit dropped / sec',
    desc: 'Outgoing packets dropped per second due to a lack of buffer space.'
  },
  'txcarr/s': {
    name: 'Carrier errors / sec',
    desc: 'Carrier (link signal) errors per second while transmitting \u2014 typically a flapping link or physical-layer issue.'
  },
  'rxfram/s': {
    name: 'Frame errors / sec',
    desc: 'Received packets per second with a frame-alignment error, usually caused by line noise or a faulty link.'
  },
  'rxfifo/s': {
    name: 'Receive FIFO overruns / sec',
    desc: 'Receive FIFO buffer overrun errors per second \u2014 the NIC filled up faster than the system could drain it.'
  },
  'txfifo/s': {
    name: 'Transmit FIFO overruns / sec',
    desc: 'Transmit FIFO buffer overrun errors per second.'
  },

  // -- Sockets (sar -n SOCK) ------------------------------------------------
  totsck: {
    name: 'Total sockets',
    desc: 'Total number of network sockets currently open on the system across all protocols. A useful overall gauge of network connection load.'
  },
  'ip-frag': {
    name: 'IP fragments',
    desc: 'Number of IP packet fragments currently queued. Large packets can be split into fragments in transit; a high number can indicate MTU/fragmentation problems.'
  },
  tcpsck: {
    name: 'TCP sockets',
    desc: 'Number of TCP sockets currently in use. TCP is the connection-oriented protocol behind most web, database, and API traffic.'
  },
  udpsck: {
    name: 'UDP sockets',
    desc: 'Number of UDP sockets currently in use. UDP is the connectionless protocol used by DNS, streaming, and similar services.'
  },
  rawsck: {
    name: 'RAW sockets',
    desc: 'Number of raw sockets in use (low-level sockets that bypass TCP/UDP, used by tools like ping and some monitoring software).'
  },

  // -- NFS client (sar -n NFS) ---------------------------------------------
  'call/s': {
    name: 'RPC calls / sec',
    desc: 'Number of RPC requests this NFS client made to the server per second \u2014 the overall rate of network file activity.'
  },
  'retrans/s': {
    name: 'RPC retransmits / sec',
    desc: 'RPC requests retransmitted per second because a reply did not arrive in time. Anything above roughly zero suggests network loss or an overloaded NFS server.'
  },
  'read/s': {
    name: 'Read calls / sec',
    desc: 'NFS read RPC calls made per second (fetching file data from the server).'
  },
  'write/s': {
    name: 'Write calls / sec',
    desc: 'NFS write RPC calls made per second (sending file data to the server).'
  },
  'access/s': {
    name: 'Access calls / sec',
    desc: 'NFS "access" RPC calls per second (permission checks on files and directories).'
  },
  'getatt/s': {
    name: 'Getattr calls / sec',
    desc: 'NFS "getattr" RPC calls per second (fetching file attributes such as size and timestamps).'
  },

  // -- NFS server (sar -n NFSD) --------------------------------------------
  'scall/s': {
    name: 'RPC requests / sec',
    desc: 'RPC requests this NFS server received per second \u2014 the overall inbound file-serving load.'
  },
  'badcall/s': {
    name: 'Bad RPC requests / sec',
    desc: 'Malformed or rejected RPC requests received per second. A rising rate can indicate a misbehaving client or an authentication problem.'
  },
  'saccess/s': {
    name: 'Access calls / sec',
    desc: 'NFS "access" RPC calls received per second (permission checks served to clients).'
  },
  'sgetatt/s': {
    name: 'Getattr calls / sec',
    desc: 'NFS "getattr" RPC calls received per second (file-attribute lookups served to clients).'
  },
  'packet/s': {
    name: 'Packets / sec',
    desc: 'Total network packets the NFS server received per second.'
  },
  'udp/s': {
    name: 'UDP packets / sec',
    desc: 'NFS packets received over UDP per second.'
  },
  'tcp/s': {
    name: 'TCP packets / sec',
    desc: 'NFS packets received over TCP per second (the default and more reliable transport for modern NFS).'
  },
  'hit/s': {
    name: 'Reply cache hits / sec',
    desc: 'Requests per second answered from the server\u2019s reply cache, avoiding repeat work for duplicate requests.'
  },
  'miss/s': {
    name: 'Reply cache misses / sec',
    desc: 'Requests per second that were not in the reply cache and had to be processed fresh.'
  },
  'sread/s': {
    name: 'Read calls / sec',
    desc: 'NFS read RPC calls received per second (clients fetching file data from this server).'
  },
  'swrite/s': {
    name: 'Write calls / sec',
    desc: 'NFS write RPC calls received per second (clients sending file data to this server).'
  }
};

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Build the HTML for a chart's info popover: a short plain-English summary,
 * a definition list of the SAR fields shown, and an optional interpretation
 * note. `tokens` reference keys in `METRICS`; unknown tokens are skipped.
 */
export function chartInfo(summary: string, tokens: string[], note?: string): string {
  const rows = tokens
    .map((token) => {
      const metric = METRICS[token];
      if (!metric) return '';
      return (
        '<div class="ci-metric">' +
          '<div class="ci-metric-head">' +
            `<code class="ci-token">${esc(token)}</code>` +
            `<span class="ci-metric-name">${esc(metric.name)}</span>` +
          '</div>' +
          `<p class="ci-metric-desc">${esc(metric.desc)}</p>` +
        '</div>'
      );
    })
    .join('');

  return (
    (summary ? `<p class="ci-summary">${esc(summary)}</p>` : '') +
    (rows ? `<div class="ci-metrics">${rows}</div>` : '') +
    (note ? `<p class="ci-note">${esc(note)}</p>` : '')
  );
}
