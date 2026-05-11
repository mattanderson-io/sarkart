# SARkart Performance Review

## What's Fast ✅

| Area | Why |
|------|-----|
| Initial parsing | V3 single-pass engine — minimal split() calls, charCode-based dispatch, line.replace() instead of split+join for normal lines |
| Index lookups | `_idx[key]` hash map — O(1) to find all lines for any section |
| unique() | O(n) with hash set instead of O(n²) $.inArray |
| Device/Interface/Error sidebar building | Hash lookup for name→index instead of nested linear scan |
| ConvertTo24Hr | Fast path returns immediately for 24h format (no regex) |
| Sort | Removed entirely — SAR data is already chronological |
| File upload | Shows real progress via FileReader.onprogress |
| Large file parsing | Chunked parser (sar-chunked-parser.js) yields to browser, prevents freeze |
| CPU sidebar | Loads in background, doesn't block UI |

## What Could Still Be Optimized 🔧

### 1. `fileOut.split()` in getOS/getHostname/getKernel (8 calls)
These split the entire 234MB `fileOut` string by newlines just to read the first line. They're called during initial load and every time the dashboard refreshes.

**Fix:** Cache the first line of fileOut once: `var _firstLine = fileOut.split("\n",1)[0];`

### 2. `getGenericData` called 174 times across all chart functions
Each call iterates all matching `_idx[key]` lines and for each one:
- `.split(",")` — splits the line
- `.split("|")` — splits the date/time
- `ConvertTo24Hr()` — converts time (fast-pathed now)
- `new Date(Date.parse(...))` — parses date string into timestamp

For sections with thousands of lines (memory, load, swap), this adds up.

**Fix:** Pre-compute timestamps during parsing and store them in the index. Or cache `Date.parse` results (same timestamps repeat across sections).

### 3. `Date.parse()` — 8 remaining calls in chart functions
Each creates a Date object from a string like `"04/01/26 00:10:04"`. With 4320 time samples per day × 30 days = 129,600 calls per chart section.

**Fix:** Build a timestamp cache during parsing: `_tsCache["04/01/26|00:10:04"] = 1743523804000`

### 4. `.split(",")` — 46 calls across chart rendering functions
Every data line gets re-split by comma each time a chart is rendered. The same line might be split multiple times across different function calls.

**Fix:** Pre-split lines into arrays during index building and store arrays instead of strings. Trades memory for speed.

### 5. `getCPU2` still processes all 1.6M CPU lines when called
The chunked parser's background CPU loader only extracts IDs. When you actually click a CPU core, `getCPU` re-scans all CPU lines for that core. With 384 cores × 4320 samples = 1.6M lines, filtering to one core still scans all of them.

**Fix:** Build a sub-index during CPU loading: `_cpuByCore["all"] = [...lines]`, `_cpuByCore["0"] = [...lines]`

### 6. jQuery `.append()` in loops (38 calls)
Building sidebar lists with individual `.append()` calls causes DOM reflow on each insertion.

**Fix:** Build HTML string first, then set `.html()` once. (Minor impact — only runs once per section.)

### 7. Highcharts rendering
Each chart creates a full Highcharts instance with thousands of data points. This is inherently slow for very large datasets but is outside our control.

**Fix:** Downsample data for display (e.g., show every 5th point for 30-day views, full resolution for single-day). Or use Highcharts `boost` module for canvas-based rendering.

## Priority Recommendations

| Priority | Fix | Expected Impact |
|----------|-----|-----------------|
| High | Timestamp cache (items 2+3) | Eliminates ~130K Date.parse calls per chart click |
| High | CPU sub-index (item 5) | Makes individual CPU chart clicks instant |
| Medium | fileOut.split cache (item 1) | Saves splitting 234MB string 8 times |
| Medium | Data downsampling for Highcharts (item 7) | Faster chart rendering for 30-day views |
| Low | Pre-split index (item 4) | Trades ~2x memory for faster chart building |
| Low | Batch DOM append (item 6) | Minor — only affects initial sidebar build |


## Benchmarks (parser only)

Measured head-to-head vs the upstream sarchart parser (`sarchart-v5.1.3.min.js`) using the Node harness at `bench/parse-bench.js`. The harness extracts each parser's hot loop into a plain function and feeds it the file as a string — no DOM, no jQuery, no progress updates. 1 warmup + 5 timed runs per file; median reported.

Hardware: Apple Silicon, Node 22.

| File | Size | Lines | Old (median) | New (median) | Speedup |
|------|------|-------|--------------|--------------|---------|
| sar-data_CaseID-00295132_Host-LIVE-900-09 (RHEL 9) | 69 MB | 760,215 | 1.79 s | 381 ms | **4.7×** |
| sar-data_CaseID-12345678_Host-Server60 (RHEL 9) | 313 MB | 3,451,472 | 9.60 s | 1.85 s | **5.2×** |

Reproduce:

```
cd sarkart-plotly
node bench/parse-bench.js [path-to-sar-file ...]
```

Files default to everything in `./test_data/*.txt` if no paths are given.


## End-to-end browser benchmark

Measures wall-clock from file-selected to dashboard-ready in real Chromium (headless, Playwright). Stop signal: `#peakCPU` element contains a numeric value. 3 runs per (app, file); median reported.

Hardware: Apple Silicon, Node 22, Playwright Chromium 147.

| File | Size | sarchart-old | sarkart-plotly | Speedup |
|------|------|--------------|-----------------|---------|
| LIVE-900-09 RHEL 9 | 69 MB / 760K lines | 4.94 s | 708 ms | **7.0×** |
| Server60 RHEL 9 | 313 MB / 3.45M lines | 52.04 s | 2.32 s | **22.4×** |

Why is the browser speedup bigger than the parse-only ~5× number? The old app does all dashboard setup synchronously in `loaded()` — parse, build headers, scan all CPU lines per-core for the peak, render 3 Highcharts donuts, etc. The new app has:

- Chunked parser that yields to the browser every 200K lines
- Pre-built `_idx` hash so per-section lookups are O(1)
- Fast peak-CPU scan over only `CPU-%usr all` lines instead of per-core
- Plotly donut charts rendered with `staticPlot: true` (no interactivity wiring)

File-read time (`FileReader.readAsText`) is essentially identical between the two apps — ~30 ms on 69 MB, ~130 ms on 313 MB — so the gap is all parse + render.

Reproduce:

```
cd sarkart-plotly
npm install --save-dev playwright
npx playwright install chromium
node bench/browser-bench.js [runs]   # default 3
```

The script spawns both apps (old on 3001, new on 3000), opens each in Chromium, uploads each `.txt` in `test_data/`, and waits for the dashboard. Writes a JSON report to `bench/browser-bench-results.json`.
