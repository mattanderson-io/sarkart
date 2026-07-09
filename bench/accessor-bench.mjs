#!/usr/bin/env node
/**
 * Measures the per-render chart-accessor cost before/after the column cache
 * (PERFORMANCE.md #2/#4). "cold" = first call after a data-generation change
 * (parses strings -> columns, i.e. the old per-call cost). "warm" = subsequent
 * calls (read cached columns). The gap is what every repeated render used to pay.
 *
 *   node --max-old-space-size=8192 bench/accessor-bench.mjs [file]
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

globalThis.window = { setTimeout: (fn, ms) => setTimeout(fn, ms) };
const { parseSarTextChunked } = await import('../src/client/lib/sarParser.ts');
const { setSarData, filterSarDataByDates, getRows, setCpuByCore } = await import('../src/client/lib/sarStore.ts');
const { buildCpuByCore } = await import('../src/client/lib/cpuIndex.ts');
const { getGenericData, getCPU } = await import('../src/client/lib/sarData.ts');

const file = path.resolve(process.argv[2] || 'test_data/sar-500mb.txt');
const text = readFileSync(file, 'utf8');
setSarData(await parseSarTextChunked(text));
const { byCore } = await buildCpuByCore(getRows('CPU-%usr'));
setCpuByCore(byCore);

function timeCalls(label, fn, warmRuns) {
  // Cold: bust the cache via a filter toggle, then first call parses.
  filterSarDataByDates(null);
  let t0 = performance.now();
  const first = fn();
  const cold = performance.now() - t0;

  t0 = performance.now();
  for (let i = 0; i < warmRuns; i += 1) fn();
  const warm = (performance.now() - t0) / warmRuns;

  console.log(
    `${label.padEnd(28)} points ${String(first.length).padStart(8)}  `
    + `cold ${cold.toFixed(1).padStart(7)} ms   warm ${warm.toFixed(2).padStart(7)} ms   `
    + `${(cold / warm).toFixed(0)}x faster on repeat`
  );
}

console.log(`\n${path.basename(file)}\n`);
timeCalls('getGenericData(runq-sz, 1)', () => getGenericData('runq-sz-plist-sz', 1), 50);
timeCalls('getGenericData(kbmemfree,%mem)', () => getGenericData('kbmemfree-kbavail', 4), 50);
timeCalls('getCPU("all", 2)', () => getCPU('all', 2), 50);
timeCalls('getCPU("0", 2)', () => getCPU('0', 2), 50);
