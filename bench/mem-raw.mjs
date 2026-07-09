#!/usr/bin/env node
/**
 * Clean retained measurement for the OLD storage model: the parser's per-row
 * string[] arrays held directly (what the store used to keep). Same warmup +
 * no-stray-ref methodology as mem-store.mjs, for an apples-to-apples compare.
 *
 *   node --expose-gc --max-old-space-size=8192 bench/mem-raw.mjs <file>
 */
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

globalThis.window = { setTimeout: (fn, ms) => setTimeout(fn, ms) };
const { parseSarTextChunked } = await import('../src/client/lib/sarParser.ts');

const MiB = 1024 ** 2;
const file = path.resolve(process.argv[2] || 'test_data/sar-100mb.txt');
const bytes = statSync(file).size;

function gc() { for (let i = 0; i < 6; i += 1) global.gc(); }
function heap() { return process.memoryUsage().heapUsed; }

let holder = null;
async function loadRaw(f) {
  const text = readFileSync(f, 'utf8');
  const parsed = await parseSarTextChunked(text);
  holder = parsed.index; // keep the string[] arrays; source + parsed wrapper die
}

await loadRaw(file);
holder = null;
gc();
const baseline = heap();

await loadRaw(file);
gc();
const retained = heap() - baseline;

console.log(
  `${path.basename(file)}: ${(bytes / MiB).toFixed(0)} MB file  →  raw string[] retained `
  + `${(retained / MiB).toFixed(0)} MB (${(retained / bytes).toFixed(2)}x)`
);
void holder;
