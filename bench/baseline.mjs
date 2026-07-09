#!/usr/bin/env node
/**
 * Baseline the REAL current parser (src/client/lib/sarParser.ts) — not the
 * ported copy in parse-bench.js — against a set of SAR files. Reports parse
 * time (median of N runs), throughput (MB/s, Mlines/s), and retained memory
 * right after parse.
 *
 * Run with GC + heap headroom:
 *   node --expose-gc --max-old-space-size=8192 bench/baseline.mjs [files...]
 *
 * Defaults to test_data/sar-100mb.txt, sar-500mb.txt, sar-1gb.txt.
 */
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

// The parser calls window.setTimeout inside its chunk-yield helper; shim it.
globalThis.window = { setTimeout: (fn, ms) => setTimeout(fn, ms) };

const { parseSarTextChunked } = await import('../src/client/lib/sarParser.ts');

const RUNS = 3;
const argFiles = process.argv.slice(2);
const files = (argFiles.length ? argFiles : [
  'test_data/sar-100mb.txt',
  'test_data/sar-500mb.txt',
  'test_data/sar-1gb.txt'
]).map((f) => path.resolve(f));

function fmtMs(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms.toFixed(0)} ms`;
}
function median(xs) {
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function gc() { if (global.gc) global.gc(); }

const results = [];

for (const file of files) {
  const bytes = statSync(file).size;
  const mb = bytes / (1024 * 1024);

  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ERR_STRING_TOO_LONG') {
      console.log(
        `${path.basename(file).padEnd(18)} ${mb.toFixed(0).padStart(5)} MB  `
        + 'CANNOT PARSE — file exceeds the V8 max string length (~512 MB). '
        + 'readAsText / a single-string parser cannot hold it.'
      );
      results.push({ file: path.basename(file), mb, tooLong: true });
      continue;
    }
    throw err;
  }
  const lines = text.length ? text.split('\n').length : 0;

  gc();
  // Warmup (JIT) — result discarded.
  await parseSarTextChunked(text);
  gc();

  const times = [];
  let mem = null;
  let sections = 0;
  let dates = 0;
  for (let i = 0; i < RUNS; i += 1) {
    gc();
    const t0 = performance.now();
    const parsed = await parseSarTextChunked(text);
    const t1 = performance.now();
    times.push(t1 - t0);
    if (i === 0) {
      const m = process.memoryUsage();
      mem = { rss: m.rss, heapUsed: m.heapUsed };
      sections = Object.keys(parsed.index).length;
      dates = parsed.dates.length;
    }
  }

  const med = median(times);
  results.push({
    file: path.basename(file),
    mb, lines, sections, dates,
    med,
    mbPerSec: mb / (med / 1000),
    mLinesPerSec: (lines / 1e6) / (med / 1000),
    rssGB: mem.rss / 1024 ** 3,
    heapGB: mem.heapUsed / 1024 ** 3
  });

  console.log(
    `${path.basename(file).padEnd(18)} ${mb.toFixed(0).padStart(5)} MB  `
    + `${(lines / 1e6).toFixed(2)} Ml  parse ${fmtMs(med).padStart(8)}  `
    + `${results.at(-1).mbPerSec.toFixed(0)} MB/s  `
    + `rss ${results.at(-1).rssGB.toFixed(2)} GB`
  );
  gc();
}

console.log('\n=== BASELINE (current parser, parse-only, median of ' + RUNS + ') ===\n');
console.log(
  'File'.padEnd(18) + 'Size'.padStart(8) + 'Lines'.padStart(10)
  + 'Sec'.padStart(6) + 'Days'.padStart(6) + 'Parse'.padStart(11)
  + 'MB/s'.padStart(9) + 'Mline/s'.padStart(10) + 'RSS'.padStart(9) + 'Heap'.padStart(9)
);
console.log('-'.repeat(96));
for (const r of results) {
  if (r.tooLong) {
    console.log(r.file.padEnd(18) + `${r.mb.toFixed(0)} MB`.padStart(8)
      + '  — exceeds V8 max string length (~512 MB); cannot parse as one string');
    continue;
  }
  console.log(
    r.file.padEnd(18)
    + `${r.mb.toFixed(0)} MB`.padStart(8)
    + `${(r.lines / 1e6).toFixed(2)}M`.padStart(10)
    + String(r.sections).padStart(6)
    + String(r.dates).padStart(6)
    + fmtMs(r.med).padStart(11)
    + r.mbPerSec.toFixed(0).padStart(9)
    + r.mLinesPerSec.toFixed(2).padStart(10)
    + `${r.rssGB.toFixed(2)}G`.padStart(9)
    + `${r.heapGB.toFixed(2)}G`.padStart(9)
  );
}
