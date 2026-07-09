# SARkart Performance Review

## Current Architecture

SARkart now uses a Preact/TypeScript shell with two parser paths:

1. `FileUploadBridge` reads files under 50 MB with `FileReader.readAsText`.
2. Files at or above 50 MB are read with `FileReader.readAsArrayBuffer` and
   routed to the parallel parser.
3. Small text inputs, including the bundled sample, use `parseSarTextChunked`
   in `src/client/lib/sarParser.ts`.
4. Large uploads use `parseArrayBufferParallel` in
   `src/client/lib/parallelParse.ts`, which splits raw bytes across Web
   Workers and parses each chunk via `src/client/lib/sarWorker.ts`.
5. `SarDataBridge` publishes the parsed data into `sarStore`, using
   `setSarDataFromJoined` for the parallel path's compact joined result.
6. CPU IDs and the per-core CPU index are built as a deferred task, so the
   dashboard can become usable before the full CPU selector work finishes.

## Multithreading

The app is multithreaded for large real uploads. Files at or above 50 MB are
parsed off the main thread by dedicated same-origin ES-module Web Workers:

| Work | Where it runs | Why it matters |
|------|---------------|----------------|
| File read | Main thread `FileReader` | Reads raw bytes for large files, avoiding the `readAsText` string ceiling |
| Large SAR parsing | Web Worker pool (`parallelParse.ts` + `sarWorker.ts`) | Uses multiple CPU cores and keeps heavy parse work off the UI thread |
| Small/sample SAR parsing | Chunked async parser with event-loop yields | Avoids worker startup overhead for small files |
| Result ingest | Main thread packed store | Adopts joined worker output without materializing millions of row strings |
| Dashboard metrics | Main thread after parse | Uses indexed sections instead of rescanning the whole file |
| CPU selector/index | Deferred chunked task | Many-core files no longer block dashboard readiness while CPU chips are built |
| Chart rendering | On demand | Plotly receives downsampled series, keeping interactions bounded |

The parallel parser works on bytes, not one giant JavaScript string. The main
thread splits an `ArrayBuffer` at SAR identity-line boundaries, posts transferred
chunk buffers to Workers, and each Worker decodes and parses locally with the
monolithic hot loop in `sarParseCore.ts`.

Workers return a compact joined shape: one `\n`-joined blob per SAR section plus
row counts. That avoids structure-cloning millions of tiny row strings and lets
`sarStore` pack the result directly.

Worker count is selected by file size in `workersForSize`:

| File size | Workers | Reason |
|-----------|---------|--------|
| `< 256 MiB` | 4 | Spawn overhead is not worth 6 workers for shorter parses |
| `>= 256 MiB` | 6 | Tuned as the robust sweet spot for 500 MB to 1.6 GB files |

8 workers was tested and dropped because it did not reliably win and regressed
on very large files due to simultaneous result payload pressure on the main
heap.

## What's Fast

| Area | Why |
|------|-----|
| Initial parsing | Single-pass parser with minimal `split()` calls, charCode-based dispatch, and `line.replace()` instead of split+join for normal lines |
| Large-file parsing | Web Worker fan-out with transferred `ArrayBuffer` chunks |
| Byte-based upload path | Large files avoid the ~512 MB single-string ceiling from `FileReader.readAsText` |
| Worker marshaling | Workers return joined section blobs instead of millions of tiny row strings |
| Packed storage | `sarStore` keeps one string plus offsets per section, reducing retained memory |
| Index lookups | Section lookup is O(1) by key |
| Full/raw index | Unfiltered packed index preserves original rows for date filtering without re-parsing |
| First-line metadata | Parser returns `firstLine`; host/OS helpers do not split the full output repeatedly |
| File upload | Shows real read progress via `FileReader.onprogress` |
| Small-file parsing | Chunked parser yields every 200K lines to avoid long UI freezes without worker overhead |
| CPU sidebar | Loads in deferred chunks and creates a per-core CPU index for fast core chart clicks |
| Chart rendering | Plotly uses LTTB downsampling (`plotly-charts.js`, max 2000 points/series) |
| KPI donuts | `staticPlot: true` avoids mode bar and interaction wiring |

## What Could Still Be Optimized

### 1. Timestamp parsing

Many chart functions repeatedly split date/time strings and call `Date.parse`
while building series.

**Fix:** pre-compute timestamps during parsing, or add a cache keyed by
`date|time` because timestamps repeat across sections.

### 2. Repeated comma splitting

Rows are still exposed as CSV-like strings, so chart builders can split the same
row multiple times across dashboard cards, chart clicks, heatmaps, findings, and
export.

**Fix:** test a pre-split or columnar representation for hot sections. Measure
carefully because this trades memory for speed, and packed strings are currently
one of the biggest memory wins.

### 3. Worker threshold tuning

The upload threshold routes files at or above 50 MB to the parallel
`ArrayBuffer` path. That is correct for large files and avoids the string
ceiling, but the exact crossover depends on browser, CPU count, and file shape.

**Fix:** keep benchmarking the 25-100 MB range and tune
`PARALLEL_THRESHOLD_BYTES` if worker startup/copy costs outweigh parallelism on
mid-sized files.

### 4. Date-filter memory churn

Date filtering unpacks packed sections, filters rows, and repacks the kept rows.
This is much cheaper than re-parsing, but it can still allocate noticeably on
large multi-day files.

**Fix:** evaluate filtered views over packed offsets instead of rebuilding new
packed strings for every date scope.

### Done

- ~~Large-file parsing on the main thread~~: files at or above 50 MB use
  `parseArrayBufferParallel` and Web Workers.
- ~~The `readAsText` ceiling for large uploads~~: large files use
  `readAsArrayBuffer`.
- ~~Worker clone-back of millions of row strings~~: Workers return joined
  section blobs, and `sarStore` ingests them directly.
- ~~`fileOut.split()` in getOS/getHostname/getKernel~~: parsers return
  `firstLine`.
- ~~CPU core clicks re-scan all CPU lines~~: the app builds a per-core CPU
  index.
- ~~Chart downsampling~~: `plotly-charts.js` applies LTTB downsampling to 2000
  points per series before `Plotly.newPlot`.

## Priority Recommendations

| Priority | Fix | Expected Impact |
|----------|-----|-----------------|
| High | Timestamp cache | Eliminates repeated `Date.parse` per chart click |
| Medium | Worker threshold tuning | Keeps the parallel path on files where it wins after startup/copy costs |
| Medium | Date-filter packed views | Reduces allocation on large multi-day files |
| Medium | Pre-split/columnar hot sections | Trades memory for faster chart, heatmap, and finding scans |

## Benchmarks: Parser Hot Loop

Measured head-to-head vs the upstream sarchart parser (`sarchart-v5.1.3.min.js`)
using the Node harness at `bench/parse-bench.js`. The harness extracts each
parser's hot loop into a plain function and feeds it the file as a string: no
DOM, no jQuery, no progress updates. 1 warmup + 5 timed runs per file; median
reported.

This benchmark is CPU-only. It does not measure browser responsiveness from
chunking, Web Worker startup, chunk transfer, clone-back, or packed-store ingest.
Use the parallel benchmark below for the large-file Worker path.

Hardware: Apple Silicon, Node 22+.

| File | Size | Lines | Old (median) | New (median) | Speedup |
|------|------|-------|--------------|--------------|---------|
| sar-data_CaseID-00295132_Host-LIVE-900-09 (RHEL 9) | 69 MB | 760,215 | 1.79 s | 381 ms | **4.7x** |
| sar-data_CaseID-12345678_Host-Server60 (RHEL 9) | 313 MB | 3,451,472 | 9.60 s | 1.85 s | **5.2x** |

Reproduce:

```bash
cd sarkart
node bench/parse-bench.js [path-to-sar-file ...]
```

Defaults to `./test_data/*.txt` if no paths are given (`test_data/` is
gitignored; add your own SAR files locally).

## Benchmarks: Parallel Parser

Use `bench/parallel-bench.mjs` to measure the real large-file path. It reports
single-threaded byte decode+parse when the file fits under the V8 string limit,
then the parallel path including split offset search, chunk copy, transfer,
in-worker parse, clone-back, and merge.

```bash
cd sarkart
node --no-warnings --max-old-space-size=8192 bench/parallel-bench.mjs [file] [workersOverride]
```

The benchmark uses the same worker-count policy as the app unless
`workersOverride` is passed. For files above the V8 single-string ceiling,
single-threaded parsing is expected to fail while the parallel byte path still
works.

## End-to-end Browser Benchmark

Measures wall-clock from file-selected to dashboard-ready in Chromium
(headless, Playwright). Stop signal: `#peakCPU` contains a numeric value. 3 runs
per app/file pair; median reported.

Hardware: Apple Silicon, Node 18+, Playwright Chromium.

| File | Size | sarchart-old | sarkart | Speedup |
|------|------|--------------|---------|---------|
| LIVE-900-09 RHEL 9 | 69 MB / 760K lines | 4.94 s | 708 ms | **7.0x** |
| Server60 RHEL 9 | 313 MB / 3.45M lines | 52.04 s | 2.32 s | **22.4x** |

Why is the browser speedup bigger than parse-only ~5x? The old app does all
dashboard setup synchronously in `loaded()`: parse, build headers, scan CPU
lines per-core for the peak, render 3 Highcharts donuts, and build sidebar
state. The new app has:

- Worker-parallel `ArrayBuffer` parser for files at or above 50 MB
- Chunked text parser for small files and samples
- Pre-built section index so per-section lookups are O(1)
- Packed store to reduce retained memory after parsing
- Fast peak-CPU scan over only `CPU-%usr all` lines instead of per-core
- Deferred per-core CPU index construction for fast CPU drill-downs
- Plotly donut charts with `staticPlot: true`
- LTTB downsampling on line charts

File-read time is essentially identical between apps for small and medium files;
the gap is parse, index, memory, and render work. For very large files, SARkart's
`readAsArrayBuffer` plus Web Worker path also avoids the browser string ceiling
that `readAsText` can hit.

Reproduce:

```bash
cd sarkart
npm install
npx playwright install chromium
node bench/browser-bench.js [runs]   # default 3
```

Writes `bench/browser-bench-results.json` (gitignored). Requires SAR files in
`./test_data/`.
