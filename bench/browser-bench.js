#!/usr/bin/env node
/**
 * Real-browser head-to-head benchmark: sarchart-old vs sarkart-plotly.
 *
 * What it measures
 * ----------------
 *   1. "File selected → FileReader onload fires": the time the browser
 *      spends reading the file off disk. Identical code path in both apps
 *      (both use new FileReader().readAsText), so numbers should match.
 *
 *   2. "File selected → dashboard ready": wall-clock from input.files = [...]
 *      to the peak-CPU number being populated. This is the number users
 *      actually care about — from picking the file to seeing charts.
 *
 * Expected environment
 * --------------------
 *   - sarchart-old server listening on 3001 (we spawn it)
 *   - sarkart-plotly server listening on 3000 (we spawn it)
 *   - Playwright + Chromium installed locally
 *
 * Output
 * ------
 *   Prints per-file / per-app stats and a summary table. Writes a JSON
 *   report to bench/browser-bench-results.json.
 *
 * Usage:
 *   node bench/browser-bench.js [runs]
 *
 *   runs defaults to 3 (browser benchmarks are noisy — 3 runs + median).
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { performance } = require('perf_hooks');
const { chromium } = require('playwright');

// --- Configuration ---------------------------------------------------------
const RUNS = parseInt(process.argv[2] || '3', 10);

const ROOT = path.resolve(__dirname, '..');                    // sarkart-plotly/
const OLD_ROOT = path.resolve(ROOT, '..', 'sarchart-old', 'sargraph.github.io');
const TEST_DATA = path.join(ROOT, 'test_data');

const APPS = [
  { name: 'sarchart-old',   cwd: OLD_ROOT, port: 3001, url: 'http://localhost:3001/' },
  { name: 'sarkart-plotly', cwd: ROOT,     port: 3000, url: 'http://localhost:3000/' }
];

// Only benchmark .txt SAR files — the .json files in test_data are traces.
const FILES = fs.readdirSync(TEST_DATA)
  .filter(f => f.endsWith('.txt'))
  .map(f => path.join(TEST_DATA, f));

if (!FILES.length) {
  console.error('No .txt SAR files found in ' + TEST_DATA);
  process.exit(1);
}

// --- Helpers ---------------------------------------------------------------
function fmt(ms) {
  if (ms >= 1000) return (ms / 1000).toFixed(2) + ' s';
  return ms.toFixed(0) + ' ms';
}

function stats(samples) {
  const sorted = samples.slice().sort((a, b) => a - b);
  const sum = samples.reduce((a, b) => a + b, 0);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
  return { min: sorted[0], max: sorted[sorted.length - 1], median, mean: sum / samples.length, samples };
}

function waitServer(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      const http = require('http');
      http.get(url, (res) => { res.resume(); resolve(); })
          .on('error', () => Date.now() > deadline ? reject(new Error('timeout waiting ' + url)) : setTimeout(tick, 200));
    };
    tick();
  });
}

async function startApp(app) {
  console.log('  Starting ' + app.name + ' on port ' + app.port + '...');
  const proc = spawn('node', ['src/index.js'], {
    cwd: app.cwd,
    env: { ...process.env, PORT: String(app.port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  proc.stderr.on('data', (d) => process.stderr.write('[' + app.name + '] ' + d));
  await waitServer(app.url, 10000);
  console.log('  ' + app.name + ' ready.');
  return proc;
}

function stopApp(proc) {
  if (proc && !proc.killed) proc.kill('SIGTERM');
}

// --- Bench a single (app, file) pair --------------------------------------
async function benchOne(browser, app, filePath, runs) {
  console.log('\n  ' + app.name + '  ×  ' + path.basename(filePath));

  const samples = { readMs: [], dashboardMs: [] };

  for (let r = 0; r < runs; r++) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    // Raise default test timeouts — the 313 MB file can take >60s on the
    // old parser on a cold browser context.
    ctx.setDefaultTimeout(300000);
    ctx.setDefaultNavigationTimeout(300000);
    const page = await ctx.newPage();

    // Silence console in normal runs; flip to true for debugging.
    const VERBOSE = false;
    if (VERBOSE) page.on('console', (msg) => console.log('    [console] ' + msg.text()));
    page.on('pageerror', (err) => console.log('    [pageerror] ' + err.message));

    await page.goto(app.url, { waitUntil: 'domcontentloaded' });

    // The upload input is created lazily by makeDroppable() in a jQuery
    // ready handler. Wait for it to appear inside .sar-file-uploader.
    await page.waitForFunction(
      () => {
        const root = document.querySelector('.sar-file-uploader');
        return root && root.querySelector('input[type="file"]');
      },
      { timeout: 30000 }
    );

    // Both apps use FileReader.onload. We monkey-patch it to capture the
    // timestamp when the file has been fully read off disk. Some minified
    // builds cache `FileReader` in a closure before the patch, so we also
    // hook `onloadend` as a fallback and consider the earliest of the two.
    await page.evaluate(() => {
      window.__benchReadStart = null;
      window.__benchReadDone  = null;
      const origRead = FileReader.prototype.readAsText;
      FileReader.prototype.readAsText = function (blob, enc) {
        window.__benchReadStart = performance.now();
        const origOnload = this.onload;
        const origOnloadend = this.onloadend;
        const markDone = (e) => {
          if (window.__benchReadDone == null) {
            window.__benchReadDone = performance.now();
          }
        };
        this.addEventListener('load',    markDone);
        this.addEventListener('loadend', markDone);
        return origRead.call(this, blob, enc);
      };
    });

    const input = await page.$('.sar-file-uploader input[type="file"]');
    if (!input) throw new Error('File input not found');

    const tStart = performance.now();
    await input.setInputFiles(filePath);

    // sarkart-plotly requires clicking "Process Data" before parsing begins.
    // sarchart-old parses on FileReader.onload directly.
    if (app.name === 'sarkart-plotly') {
      await page.waitForFunction(() => {
        const btn = document.getElementById('btnProcessData');
        return btn && btn.offsetParent !== null; // visible
      }, { timeout: 120000 });
      await page.click('#btnProcessData');
    }

    // Dashboard is "ready" when peakCPU has a non-empty numeric value.
    await page.waitForFunction(() => {
      const el = document.getElementById('peakCPU');
      if (!el) return false;
      const txt = (el.textContent || '').trim();
      return txt.length > 0 && /\d/.test(txt);
    }, { timeout: 300000 });
    const tEnd = performance.now();

    const { readStart, readDone } = await page.evaluate(() => ({
      readStart: window.__benchReadStart,
      readDone:  window.__benchReadDone
    }));

    const readMs = (readDone != null && readStart != null) ? (readDone - readStart) : NaN;
    const dashboardMs = tEnd - tStart;

    samples.readMs.push(readMs);
    samples.dashboardMs.push(dashboardMs);
    console.log('    run ' + (r + 1) + '/' + runs + ': read ' + (Number.isFinite(readMs) ? fmt(readMs) : 'n/a') + '   dashboard ' + fmt(dashboardMs));

    await ctx.close();
  }

  return {
    read:      stats(samples.readMs.filter(Number.isFinite)),
    dashboard: stats(samples.dashboardMs)
  };
}

// --- Main ------------------------------------------------------------------
(async () => {
  console.log('Starting apps...');
  const [oldProc, newProc] = await Promise.all(APPS.map(startApp));

  console.log('\nLaunching Chromium...');
  const browser = await chromium.launch({ headless: true });

  const results = [];
  try {
    for (const f of FILES) {
      const size = fs.statSync(f).size;
      const mb = +(size / (1024 * 1024)).toFixed(1);
      console.log('\n=== ' + path.basename(f) + ' (' + mb + ' MB) ===');

      const fileResult = { file: path.basename(f), sizeMB: mb, perApp: {} };
      for (const app of APPS) {
        fileResult.perApp[app.name] = await benchOne(browser, app, f, RUNS);
      }
      results.push(fileResult);
    }
  } finally {
    await browser.close();
    stopApp(oldProc);
    stopApp(newProc);
  }

  // --- Report -------------------------------------------------------------
  console.log('\n\n=============== SUMMARY (medians) ===============\n');
  const headers = ['File', 'Size', 'App', 'File read', 'Dashboard ready'];
  const rows = [];
  for (const r of results) {
    for (const name of Object.keys(r.perApp)) {
      const p = r.perApp[name];
      rows.push([r.file, r.sizeMB + ' MB', name, fmt(p.read.median), fmt(p.dashboard.median)]);
    }
  }
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));
  const pad = (s, w) => s + ' '.repeat(w - s.length);
  console.log(headers.map((h, i) => pad(h, widths[i])).join('  '));
  console.log(widths.map(w => '-'.repeat(w)).join('  '));
  for (const row of rows) console.log(row.map((c, i) => pad(c, widths[i])).join('  '));

  // Speedup per file: old_dashboard_median / new_dashboard_median
  console.log('\nSpeedup (old dashboard / new dashboard):');
  for (const r of results) {
    const oldMed = r.perApp['sarchart-old'].dashboard.median;
    const newMed = r.perApp['sarkart-plotly'].dashboard.median;
    console.log('  ' + r.file + '   ' + (oldMed / newMed).toFixed(2) + 'x');
  }

  const out = path.join(__dirname, 'browser-bench-results.json');
  fs.writeFileSync(out, JSON.stringify({ runs: RUNS, results }, null, 2));
  console.log('\nWrote ' + out);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
