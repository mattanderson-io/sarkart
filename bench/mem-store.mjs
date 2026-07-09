#!/usr/bin/env node
/**
 * Clean single-file retained measurement. Warms up V8 (so the ~200 MB one-time
 * parse overhead is in the baseline), then loads ONE file into the packed store
 * with no stray references, GCs, and measures the store's retained increment.
 *
 *   node --expose-gc --max-old-space-size=8192 bench/mem-store.mjs <file>
 */
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

globalThis.window = { setTimeout: (fn, ms) => setTimeout(fn, ms) };
const { parseSarTextChunked } = await import('../src/client/lib/sarParser.ts');
const { setSarData, getActiveIndex } = await import('../src/client/lib/sarStore.ts');

const MiB = 1024 ** 2;
const file = path.resolve(process.argv[2] || 'test_data/sar-100mb.txt');
const bytes = statSync(file).size;

function gc() { for (let i = 0; i < 6; i += 1) global.gc(); }
function heap() { return process.memoryUsage().heapUsed; }

async function loadIntoStore(f) {
  const text = readFileSync(f, 'utf8');
  const parsed = await parseSarTextChunked(text);
  setSarData(parsed);
  // text and parsed are locals — they die when this function returns.
}

// Warm up: parse+store once, then clear the store. Leaves one-time V8 overhead resident.
await loadIntoStore(file);
setSarData({ firstLine: '', headers: [], index: {}, fullIndex: {}, dates: [] });
gc();
const baseline = heap();

// Real load.
await loadIntoStore(file);
gc();
const retained = heap() - baseline;

const idx = getActiveIndex();
let textChars = 0;
for (const k of Object.keys(idx)) textChars += idx[k].text.length;

console.log(
  `${path.basename(file)}: ${(bytes / MiB).toFixed(0)} MB file  →  store retained `
  + `${(retained / MiB).toFixed(0)} MB (${(retained / bytes).toFixed(2)}x)  `
  + `[packed text ${(textChars / MiB).toFixed(0)} MB]`
);
