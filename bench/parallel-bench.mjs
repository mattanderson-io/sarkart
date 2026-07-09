#!/usr/bin/env node
/**
 * Run the parallel parse for a file. Marshaling is always JOINED (workers
 * return one blob per section); worker count auto-selects by size via
 * workersForSize (override with arg 3). Reports single-threaded decode+parse
 * (when the file fits under the ~512 MB V8 string ceiling) vs the parallel
 * path, INCLUDING split + chunk memcpy + transfer + in-worker parse +
 * clone-back + merge.
 *
 *   node --no-warnings --max-old-space-size=8192 bench/parallel-bench.mjs [file] [workersOverride]
 */
import { Worker } from 'node:worker_threads';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';

const { parseBytes, findSplitOffsets, mergeJoined, workersForSize } =
  await import('../src/client/lib/sarParseCore.ts');

const MiB = 1024 ** 2;
const file = path.resolve(process.argv[2] || 'test_data/sar-500mb.txt');
const fileBytes = statSync(file).size;
const mb = fileBytes / MiB;

const nWorkers = process.argv[3] ? Number(process.argv[3]) : workersForSize(fileBytes);
const workerURL = new URL('./joinedWorker.mjs', import.meta.url);
const merge = mergeJoined;

const bytes = new Uint8Array(readFileSync(file));

function copyRange(start, end) {
  const src = bytes.subarray(start, end);
  const out = new Uint8Array(src.length);
  out.set(src);
  return out;
}

function parallelParse() {
  const offsets = findSplitOffsets(bytes, nWorkers);
  const nChunks = offsets.length - 1;
  const workers = [];
  const jobs = [];
  for (let i = 0; i < nChunks; i += 1) {
    const chunk = copyRange(offsets[i], offsets[i + 1]);
    const w = new Worker(workerURL);
    workers.push(w);
    jobs.push(new Promise((resolve, reject) => {
      w.on('message', resolve);
      w.on('error', reject);
      w.postMessage({ buffer: chunk.buffer }, [chunk.buffer]);
    }));
  }
  return Promise.all(jobs).then((partials) => {
    workers.forEach((w) => w.terminate());
    return { result: merge(partials), chunks: nChunks };
  });
}

function summary(res) {
  const keys = Object.keys(res.counts);
  const rows = keys.reduce((a, k) => a + res.counts[k], 0);
  return `${keys.length} sections, ${rows} rows, ${res.dates.length} days`;
}

function fmt(ms) { return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms.toFixed(0)} ms`; }

const workerSel = process.argv[3] ? 'override' : 'auto by size';
console.log(`\n${path.basename(file)} — ${mb.toFixed(0)} MB   (${nWorkers}w ${workerSel}, JOINED, ${cpus().length} cores)\n`);

let singleMs = null;
try {
  parseBytes(bytes);
  const t0 = performance.now();
  parseBytes(bytes);
  singleMs = performance.now() - t0;
  console.log(`single-threaded        ${fmt(singleMs).padStart(9)}   ${(mb / (singleMs / 1000)).toFixed(0)} MB/s`);
} catch (err) {
  const why = /string longer than|Invalid string length/i.test(String(err && err.message))
    ? 'exceeds V8 max string length (~512 MB)'
    : String(err && err.message);
  console.log(`single-threaded          FAILED   ${why}`);
}

await parallelParse(); // warm
const t0 = performance.now();
const { result, chunks } = await parallelParse();
const ms = performance.now() - t0;
const speed = singleMs ? `${(singleMs / ms).toFixed(2)}x` : ' n/a';
console.log(
  `${String(nWorkers).padStart(2)} workers (${chunks} chunks) ${fmt(ms).padStart(9)}   `
  + `${(mb / (ms / 1000)).toFixed(0)} MB/s   ${speed}   ${summary(result)}`
);
