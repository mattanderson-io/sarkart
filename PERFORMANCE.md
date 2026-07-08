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
| Large file parsing | Chunked parser (`sar-chunked-parser.js`) yields to the browser, prevents freeze |
| CPU sidebar | Loads in background, doesn't block UI |
| Chart rendering | Plotly with LTTB downsampling (`plotly-charts.js`, max 2000 points/series) |
| KPI donuts | `staticPlot: true` — no mode bar or interaction wiring |

## What Could Still Be Optimized 🔧

### 1. `fileOut.split()` in getOS/getHostname/getKernel (8 calls)
These split the entire `fileOut` string by newlines just to read the first line. Called during initial load and dashboard refresh.

**Fix:** Cache the first line once: `var _firstLine = fileOut.split("\n",1)[0];`

### 2. `getGenericData` called many times across chart functions
Each call iterates matching `_idx[key]` lines and for each one splits by comma, splits date/time, and parses timestamps.

**Fix:** Pre-compute timestamps during parsing and store them in the index. Or cache `Date.parse` results (same timestamps repeat across sections).

### 3. `Date.parse()` in chart functions
Each creates a Date object from strings like `"04/01/26 00:10:04"`. With thousands of samples per section this adds up.

**Fix:** Build a timestamp cache during parsing: `_tsCache["04/01/26|00:10:04"] = 1743523804000`

### 4. `.split(",")` across chart rendering
Every data line gets re-split on each chart render. The same line may be split multiple times.

**Fix:** Pre-split lines into arrays during index building. Trades memory for speed.

### 5. `getCPU` still scans all CPU lines for a single core
The chunked parser's background CPU loader extracts IDs. Clicking a core re-scans all CPU lines for that core. On many-core hosts this is still O(all CPU lines).

**Fix:** Sub-index during CPU loading: `_cpuByCore["0"] = [...lines]`

### 6. jQuery `.append()` in loops
Building sidebar lists with individual `.append()` calls causes DOM reflow on each insertion.

**Fix:** Build HTML string first, then set `.html()` once. (Minor — runs once per section.)

### 7. ~~Chart downsampling~~ ✅ Done
`plotly-charts.js` applies LTTB downsampling to 2000 points per series before `Plotly.newPlot`.

## Priority Recommendations

| Priority | Fix | Expected Impact |
|----------|-----|-----------------|
| High | Timestamp cache (items 2+3) | Eliminates repeated Date.parse per chart click |
| High | CPU sub-index (item 5) | Makes individual CPU chart clicks faster on many-core hosts |
| Medium | fileOut.split cache (item 1) | Avoids splitting large strings repeatedly |
| Low | Pre-split index (item 4) | Trades memory for faster chart building |
| Low | Batch DOM append (item 6) | Minor — initial sidebar build only |

## Benchmarks (parser only)

Measured head-to-head vs the upstream sarchart parser (`sarchart-v5.1.3.min.js`) using the Node harness at `bench/parse-bench.js`. The harness extracts each parser's hot loop into a plain function and feeds it the file as a string — no DOM, no jQuery, no progress updates. 1 warmup + 5 timed runs per file; median reported.

Hardware: Apple Silicon, Node 22+.

| File | Size | Lines | Old (median) | New (median) | Speedup |
|------|------|-------|--------------|--------------|---------|
| sar-data_CaseID-00295132_Host-LIVE-900-09 (RHEL 9) | 69 MB | 760,215 | 1.79 s | 381 ms | **4.7×** |
| sar-data_CaseID-12345678_Host-Server60 (RHEL 9) | 313 MB | 3,451,472 | 9.60 s | 1.85 s | **5.2×** |

Reproduce:

```bash
cd sarkart
node bench/parse-bench.js [path-to-sar-file ...]
```

Defaults to `./test_data/*.txt` if no paths are given (`test_data/` is gitignored — add your own SAR files locally).

## End-to-end browser benchmark

Measures wall-clock from file-selected to dashboard-ready in Chromium (headless, Playwright). Stop signal: `#peakCPU` contains a numeric value. 3 runs per (app, file); median reported.

Hardware: Apple Silicon, Node 18+, Playwright Chromium.

| File | Size | sarchart-old | sarkart | Speedup |
|------|------|--------------|---------|---------|
| LIVE-900-09 RHEL 9 | 69 MB / 760K lines | 4.94 s | 708 ms | **7.0×** |
| Server60 RHEL 9 | 313 MB / 3.45M lines | 52.04 s | 2.32 s | **22.4×** |

Why is the browser speedup bigger than parse-only ~5×? The old app does all dashboard setup synchronously in `loaded()` — parse, build headers, scan all CPU lines per-core for the peak, render 3 Highcharts donuts, etc. The new app has:

- Chunked parser that yields to the browser every 200K lines
- Pre-built `_idx` hash so per-section lookups are O(1)
- Fast peak-CPU scan over only `CPU-%usr all` lines instead of per-core
- Plotly donut charts with `staticPlot: true`
- LTTB downsampling on line charts

File-read time (`FileReader.readAsText`) is essentially identical between the two apps — ~30 ms on 69 MB, ~130 ms on 313 MB — so the gap is parse + render.

Reproduce:

```bash
cd sarkart
npm install          # includes Playwright dev dep
npx playwright install chromium
node bench/browser-bench.js [runs]   # default 3
```

Writes `bench/browser-bench-results.json` (gitignored). Requires SAR files in `./test_data/`.
