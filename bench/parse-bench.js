#!/usr/bin/env node
/**
 * Head-to-head parse benchmark for sarchart-old vs sarkart-plotly.
 *
 * Both parsers are browser-side JS, so we extract each one's hot loop into
 * a plain function, feed it the file as a string, and measure with
 * performance.now(). No DOM, no jQuery, no progress updates.
 *
 * Each file is warmed once and timed 5 runs; we report min / median / mean.
 *
 * Usage:
 *   node bench/parse-bench.js [path-to-sar-file ...]
 *
 * If no args are given, the two files in ./test_data/ are used.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

// ---------- OLD PARSER (sarchart-old / sarchart-v5.1.3.min.js) --------------
// Port of loaded()'s parse block, with DOM / progress calls removed.
// Source: sarchart-old/sargraph.github.io/public/js/sarchart-v5.1.3.min.js
function parseOld(text) {
  let fileOut = '';
  const lines = text
    .replace(/^.*System configuration.*$/gm, '')
    .replace(/^\s*$(?:\r\n?|\n)/gm, '\n')
    .split('\n');
  const a = ['%usr','device','bread/s','swpin/s','iget/s','rawch/s','proc-sz',
    'msg/s','atch/s','pgout/s','freemem','sml_mem','CPU','proc/s','pswpin/s',
    'pgpgin/s','tps','frmpg/s','kbmemfree','kbswpfree','kbhugfree','dentunusd',
    'runq-sz','DEV','IFACE','call/s','scall/s','totsck','TTY','INTR','slots'];
  const headers = [];
  let r = '', s = '';

  for (let l = 0; l < lines.length; l++) {
    const n = lines[l].split(/\s+/);
    if (n[0] === 'Linux') { r = n[3]; s = ''; }
    else if (n[0] === 'SunOS' || n[0] === 'AIX') { r = n[5]; s = ''; }

    if (n[1] === 'AM' || n[1] === 'PM') {
      if (a.indexOf(n[2]) > -1) {
        s = n[2] + '-' + n[3] + ',';
        const c = n.slice(2).join(',');
        if (headers.indexOf(c) === -1) headers.push(c);
        continue;
      }
    } else if (a.indexOf(n[1]) > -1) {
      s = n[1] + '-' + n[2] + ',';
      const u = n.slice(1).join(',');
      if (headers.indexOf(u) === -1) headers.push(u);
      continue;
    }

    const line = lines[l];
    if (line && (line.startsWith('Linux') || line.startsWith('AIX') || line.startsWith('SunOS'))) {
      fileOut += line.replace(/\s+AM/g, ':AM').replace(/\s+PM/g, ':PM').replace(/\s+/g, ',') + '\n';
    } else if (line && !line.startsWith('Average')) {
      fileOut += s + r + '|' + line.replace(/\s+AM/g, ':AM').replace(/\s+PM/g, ':PM').replace(/\s+/g, ',') + '\n';
    }
  }

  return { linesOut: fileOut.length, headers: headers.length };
}

// ---------- NEW PARSER (sarkart-plotly / sar-chunked-parser.js) -------------
// Port of chunkedLoaded()'s inner loop. The chunking (setTimeout yields to
// the UI) is irrelevant to CPU time, so we run it in one pass here — that's
// exactly what the CPU does regardless, just with event-loop yields in the
// browser. This measures the actual parsing work.
function parseNew(text) {
  const lines = text.split('\n');
  const lineCount = lines.length;

  const a = {'%usr':1,'device':1,'bread/s':1,'swpin/s':1,'iget/s':1,'rawch/s':1,
    'proc-sz':1,'msg/s':1,'atch/s':1,'pgout/s':1,'freemem':1,'sml_mem':1,
    'CPU':1,'proc/s':1,'pswpin/s':1,'pgpgin/s':1,'tps':1,'frmpg/s':1,
    'kbmemfree':1,'kbswpfree':1,'kbhugfree':1,'dentunusd':1,'runq-sz':1,
    'DEV':1,'IFACE':1,'call/s':1,'scall/s':1,'totsck':1,'TTY':1,'INTR':1,
    'slots':1};
  const headersSet = {};
  const headers = [];
  const wsRx = /\s+/g;
  const numRx = /^[\d.+-]+$/;
  let sKey = '', inS = false;
  let n, r = '', s = '';
  const _idx = {};
  const _cachedLines = [];
  const _allDates = {};
  const _allDatesArr = [];

  for (let l = 0; l < lineCount; l++) {
    const line = lines[l];
    if (!line) { inS = false; continue; }
    const firstChar = line.charCodeAt(0);

    if (firstChar === 65) { // 'A'
      if (line.charCodeAt(1) === 118) { inS = false; continue; }        // "Av..."
      if (line.charCodeAt(1) === 73) { // 'AIX'
        n = line.split(wsRx); r = n[5]; s = ''; sKey = '';
        _cachedLines.push(line.replace(wsRx, ','));
        inS = false; continue;
      }
      continue;
    }
    if (firstChar === 76 && line.charCodeAt(1) === 105) { // "Linux"
      n = line.split(wsRx); r = n[3]; s = ''; sKey = '';
      _cachedLines.push(line.replace(wsRx, ','));
      inS = false; continue;
    }
    if (firstChar === 83) { // 'S'
      if (line.charCodeAt(1) === 117) { // "SunOS"
        n = line.split(wsRx); r = n[5]; s = ''; sKey = '';
        _cachedLines.push(line.replace(wsRx, ','));
        inS = false;
      }
      continue;
    }
    if (firstChar < 48 || firstChar > 57) continue; // not a digit

    // token1
    const sp1 = line.indexOf(' ');
    if (sp1 === -1) continue;
    let t1s = sp1 + 1;
    while (t1s < line.length && line.charCodeAt(t1s) === 32) t1s++;
    let t1e = t1s;
    while (t1e < line.length && line.charCodeAt(t1e) !== 32 && line.charCodeAt(t1e) !== 9) t1e++;
    const token1 = line.substring(t1s, t1e);

    // last token
    let le = line.length - 1;
    while (le > 0 && (line.charCodeAt(le) === 32 || line.charCodeAt(le) === 9)) le--;
    let ls = le;
    while (ls > 0 && line.charCodeAt(ls - 1) !== 32 && line.charCodeAt(ls - 1) !== 9) ls--;
    const lastToken = line.substring(ls, le + 1);

    if ((lastToken === 'IFACE' || lastToken === 'DEV') && t1s < ls) {
      n = line.split(wsRx); n.pop(); n.splice(1, 0, lastToken);
      sKey = lastToken + '-' + n[2]; s = sKey + ',';
      const hdr3 = n.slice(1).join(',');
      if (!headersSet[hdr3]) { headersSet[hdr3] = 1; headers.push(hdr3); }
      inS = true; continue;
    }
    if (token1 === 'AM' || token1 === 'PM') {
      n = line.split(wsRx);
      if (a[n[2]]) {
        sKey = n[2] + '-' + n[3]; s = sKey + ',';
        const c = n.slice(2).join(',');
        if (!headersSet[c]) { headersSet[c] = 1; headers.push(c); }
        inS = false; continue;
      }
    } else if (a[token1]) {
      n = line.split(wsRx); sKey = token1 + '-' + n[2]; s = sKey + ',';
      const u = n.slice(1).join(',');
      if (!headersSet[u]) { headersSet[u] = 1; headers.push(u); }
      inS = false; continue;
    }

    let csvLine;
    if (inS && !numRx.test(lastToken)) {
      n = line.split(wsRx); n.pop(); n.splice(1, 0, lastToken);
      csvLine = s + r + '|' + n.join(',');
    } else {
      csvLine = s + r + '|' + line.replace(wsRx, ',');
    }

    if (!_idx[sKey]) _idx[sKey] = [];
    _idx[sKey].push(csvLine);
    _cachedLines.push(csvLine);

    const ci = sKey.length + 1;
    const pi = csvLine.indexOf('|', ci);
    if (pi > -1) {
      const dt = csvLine.substring(ci, pi);
      if (!_allDates[dt]) { _allDates[dt] = 1; _allDatesArr.push(dt); }
    }
  }

  let idxTotal = 0;
  for (const k in _idx) idxTotal += _idx[k].length;
  return {
    cachedLines: _cachedLines.length,
    headers: headers.length,
    indexedRows: idxTotal,
    dates: _allDatesArr.length
  };
}

// ---------- Runner ---------------------------------------------------------
function stats(samples) {
  const sorted = samples.slice().sort((a, b) => a - b);
  const sum = samples.reduce((a, b) => a + b, 0);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median,
    mean: sum / samples.length
  };
}

function fmt(ms) {
  if (ms >= 1000) return (ms / 1000).toFixed(2) + ' s';
  return ms.toFixed(1) + ' ms';
}

function benchFile(filePath, runs = 5) {
  const abs = path.resolve(filePath);
  console.log('\n=== ' + path.basename(abs) + ' ===');
  console.log('Loading file into memory...');
  const text = fs.readFileSync(abs, 'utf8');
  const mb = (text.length / (1024 * 1024)).toFixed(1);
  const lines = text.split('\n').length;
  console.log('  Size: ' + mb + ' MB, ' + lines.toLocaleString() + ' lines\n');

  // Warmup
  process.stdout.write('  Warmup (old)...'); parseOld(text); console.log(' done');
  process.stdout.write('  Warmup (new)...'); parseNew(text); console.log(' done');

  // Timed runs
  const oldSamples = [];
  const newSamples = [];
  for (let i = 0; i < runs; i++) {
    process.stdout.write('  Run ' + (i + 1) + '/' + runs + ': old... ');
    let t0 = performance.now();
    parseOld(text);
    let t1 = performance.now();
    oldSamples.push(t1 - t0);
    process.stdout.write(fmt(t1 - t0) + ', new... ');
    t0 = performance.now();
    parseNew(text);
    t1 = performance.now();
    newSamples.push(t1 - t0);
    console.log(fmt(t1 - t0));
  }

  const oldS = stats(oldSamples);
  const newS = stats(newSamples);
  const speedup = oldS.median / newS.median;

  console.log('\n  Parser      min         median      mean        max');
  console.log('  --------    --------    --------    --------    --------');
  console.log('  old (HC)    ' + fmt(oldS.min).padEnd(12) + fmt(oldS.median).padEnd(12) + fmt(oldS.mean).padEnd(12) + fmt(oldS.max));
  console.log('  new (PLT)   ' + fmt(newS.min).padEnd(12) + fmt(newS.median).padEnd(12) + fmt(newS.mean).padEnd(12) + fmt(newS.max));
  console.log('\n  Speedup (median): ' + speedup.toFixed(2) + 'x faster');

  return { file: path.basename(abs), sizeMB: +mb, lines, old: oldS, new: newS, speedup };
}

// ---------- CLI ------------------------------------------------------------
const args = process.argv.slice(2);
let files;
if (args.length) {
  files = args;
} else {
  const defaultDir = path.resolve(__dirname, '..', 'test_data');
  files = fs.readdirSync(defaultDir)
    .filter(f => f.endsWith('.txt'))
    .map(f => path.join(defaultDir, f));
}

if (!files.length) {
  console.error('No SAR files found. Pass them as args or put them in ./test_data/.');
  process.exit(1);
}

const results = [];
for (const f of files) results.push(benchFile(f));

console.log('\n\n=============== SUMMARY ===============\n');
console.log('File'.padEnd(55) + 'Size    Old median   New median   Speedup');
console.log('-'.repeat(100));
for (const r of results) {
  console.log(
    r.file.padEnd(55) +
    (r.sizeMB + ' MB').padEnd(8) +
    fmt(r.old.median).padEnd(13) +
    fmt(r.new.median).padEnd(13) +
    r.speedup.toFixed(2) + 'x'
  );
}
