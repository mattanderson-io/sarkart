#!/usr/bin/env node
/**
 * Generate a large synthetic SAR file by repeating the bundled sample, one
 * "day" per repetition, rewriting the identity-line date so each repeat is a
 * distinct date (realistic multi-day capture; exercises the dates/fullIndex
 * path). Output is byte-for-byte valid SAR text the real parser accepts.
 *
 * Usage: node bench/gen-sar.mjs <targetMB> <outPath> [samplePath]
 */
import { readFileSync, createWriteStream, statSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const targetMB = Number(process.argv[2]);
const outPath = process.argv[3];
const samplePath = process.argv[4]
  || path.resolve(import.meta.dirname, '..', 'public', 'sample', 'sample-sar.txt');

if (!Number.isFinite(targetMB) || !outPath) {
  console.error('Usage: node bench/gen-sar.mjs <targetMB> <outPath> [samplePath]');
  process.exit(1);
}

const sample = readFileSync(samplePath, 'utf8');
const BASE_DATE = '04/01/26';                 // the sample's identity-line date
const targetBytes = Math.round(targetMB * 1024 * 1024);
const sampleBytes = Buffer.byteLength(sample, 'utf8');
const reps = Math.ceil(targetBytes / sampleBytes);

// MM/DD/YY, fixed 8-char width so the identity-line alignment is preserved.
function fmtDate(d) {
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const yy = String(d.getUTCFullYear() % 100).padStart(2, '0');
  return `${mm}/${dd}/${yy}`;
}

const base = new Date(Date.UTC(2026, 3, 1)); // 2026-04-01
mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
const out = createWriteStream(outPath);

function write(chunk) {
  return new Promise((resolve) => {
    if (out.write(chunk)) resolve();
    else out.once('drain', resolve);
  });
}

let written = 0;
for (let i = 0; i < reps; i += 1) {
  const d = new Date(base.getTime() + i * 86400000);
  const block = sample.split(BASE_DATE).join(fmtDate(d));
  // eslint-disable-next-line no-await-in-loop
  await write(block);
  written += Buffer.byteLength(block, 'utf8');
}
await new Promise((resolve) => out.end(resolve));

const finalBytes = statSync(outPath).size;
console.log(
  `${outPath}: ${reps} days, ${(finalBytes / (1024 * 1024)).toFixed(1)} MB `
  + `(target ${targetMB} MB)`
);
