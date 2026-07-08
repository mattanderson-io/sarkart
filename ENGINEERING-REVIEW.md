# SARkart — Principal Engineer Review

Last updated: 2026-07-08

A prioritized task list from a principal-level review of the Preact/Vite/TypeScript
codebase. Items are grouped by theme and ordered roughly by leverage-to-cost.
Check items off as they land.

## Overall assessment

Fast, thoughtfully built client-side SAR viewer with a strong performance story
(single-pass charCode parser, O(1) section index, chunked yielding) and an
unusually well-documented migration off the legacy jQuery/Highcharts/Handlebars/
Bootstrap stack. The main debt was architectural: the app's real state and control flow lived on
`window` (global mirror + reassigned `window.*` functions + DOM-id coordination)
rather than in Preact. The engine was swapped; the legacy chassis remained.

**Status (2026-07-08): all items below are complete.** The `window` data bus is
retired (`sarStore` is the single source of truth), the importable engine
primitives are direct imports, CI gates (typecheck/lint/test) are in place, the
data layer is split and better covered by tests, and the server ships a strict
CSP + security headers. Remaining `window.*` usage is limited to the
vendored-Plotly interop and a few intentionally-decorated functions (documented
in `legacy.d.ts`).

---

## Correctness

- [x] **`renderDeviceList` drew `containerD` then immediately hid it.**
  (2026-07-08) The Devices renderer in `ChartRouterBridge.tsx` populated
  `containerD` (await / service-time / `%util` — `%util` = device saturation)
  and then called `window.hideBlock('D')` on the next line, so that panel never
  displayed. Removed the stray `hideBlock('D')`; `chartPage()` (run by the
  submenu click handler) already shows blocks A–D. Verified live against the
  bundled sample: all four device chart blocks now render Plotly charts and are
  `display: block`.
- [x] **AIX/Solaris multi-OS chart bugs.** The AIX "idle" copy-paste (plotted
  `%usr`/`%sys` under a `%wio`/`%idle` label) and the AIX processes renderer
  writing three charts to `containerB` are gone — removed with AIX/Solaris
  support (2026-07-08).

## Testing & CI gates

- [x] **Add a `typecheck` script.** (2026-07-08) Added `"typecheck": "tsc
  --noEmit"` to `package.json` and wired it into CI (see below), so `src/client`
  is now type-checked on every push/PR.
- [x] **Add a linter (ESLint).** (2026-07-08) ESLint 9 flat config
  (`eslint.config.mjs`) with typescript-eslint, type-aware on `src/client`.
  Enabled the prioritized rules — `@typescript-eslint/no-floating-promises` and
  `no-unsafe-optional-chaining` (plus `no-misused-promises` and
  `react-hooks/rules-of-hooks`) — while deliberately skipping the full
  type-checked preset so the typed-`window` bridge pattern doesn't drown real
  findings. Fixed everything it surfaced: 7 floating promises (`void`-marked
  fire-and-forget bridge calls), two ternary-statement uses, an unused helper,
  and a `prefer-const`. `npm run lint` is green.
- [x] **Extend fixture coverage** for the date-filter → re-index → CPU-by-core
  rebuild flow. (2026-07-08) Extracted the per-core index builder into a
  testable `lib/cpuIndex.ts` (`buildCpuByCore`, preserving the chunked yielding)
  and pointed `SarDataBridge` at it. New `test/cpuReindex.test.ts` drives the
  real chain (`parseSarTextChunked` → `setSarData` → `filterSarDataByDates` →
  `buildCpuByCore` → `getCPU`): natural-sorted 65 cores, chunked-vs-single-pass
  equivalence, and that a date-filter change re-indexes rather than serving
  stale per-core data. Test count 27 → 31.

**CI:** `.github/workflows/ci.yml` runs `typecheck` → `lint` → `test` → `build`
on push/PR (Node from `.nvmrc`, `npm ci`).

## Architecture: retire the `window` bus

- [x] **Delete the legacy-global mirror.** (2026-07-08) `sarStore.ts` is now the
  single source of truth: added typed accessors (`getActiveIndex`, `getRows`,
  `getFullIndex`, `getHeaders`, `getFirstLine`, `getDates`, `hasData`, plus the
  derived `getCpuByCore`/`setCpuByCore`) and deleted `mirrorToLegacyGlobals`.
  Migrated every reader off `window._idx`/`_fullIdx`/`headers`/`_firstLine`/
  `_allDatesArr`/`_cpuByCore`: `sarData.ts`, `sarEngine.ts`, `SarDataBridge`,
  `PdfExportBridge`, `LandingBridge`. Confirmed no vendored JS (`plotly-charts.js`)
  depended on the globals. Verified live: dashboard KPIs, host/OS/dates,
  per-core CPU, and device charts all render from the store with no console
  errors. (Node's test runner needed explicit `.ts` on the two new lib→store
  runtime imports; enabled `allowImportingTsExtensions`.)
- [x] **Removed the dead data globals from `legacy.d.ts`** (`_idx`, `_fullIdx`,
  `_cpuByCore`, `headers`, `_firstLine`, `_allDatesArr`) now that nothing reads
  them. The remaining `window.*` surface is the UI/engine *function* bus
  (`printChart`, `getOS`, `chartPage`, …), which is already typed in
  `legacy.d.ts`; fully retiring that function bus (bridges importing instead of
  calling `window.*`) is a larger follow-up, tracked below.
- [x] **Retire the importable `window.*` engine primitives.** (2026-07-08)
  Migrated 12 functions off the `window` bus to direct `lib/sarEngine` imports:
  `showBlock`, `hideBlock`, `show`, `hide`, `showNotes`, `progressBarReset`,
  `homePage`, `getOS`, `getHostname`, `getKernel`, `getServerInfo`,
  `grepHeaders`. `CoreEngineBridge` now installs 3 functions instead of 15, and
  their declarations are gone from `legacy.d.ts` — so a typo/rename is now a
  compile error instead of a silent `window.foo?.()` no-op. tsc verified every
  call site was migrated (removing the decls turns any miss into an error).
  Verified live: dashboard KPIs, per-core CPU (incl. `hideBlock('D')`), device
  charts, and the host-suffix title strip all work, no console errors.

  **Intentionally still on `window`** (documented in `legacy.d.ts`): the
  vendored-Plotly interop (`printChart`/`printMultiChart`/`printPieChart`/
  `sarkartRefreshHeatmaps` — the TS↔vendored-JS boundary); the three functions
  decorated in place (`chartPage`/`updateProgress` by `legacyUi`, `displayTitle`
  by `LandingBridge`); and the bridge override targets (`getCPUchart`/
  `getDevices`/`getInterfaceTraffic`/`getInterfaceErrors`). Fully retiring those
  would mean redesigning the decoration/override mechanism — a separate,
  lower-value effort.
- [x] **Split `getGenericData`'s dual responsibility.** (2026-07-08) It used to
  both return a series and write peak-KPI text into a DOM element via a `target`
  param. Now `getSeriesWithPeak(key, column)` is a pure transform returning
  `{ points, peakValue, peakTime }`; `getGenericData` is a thin `.points`
  wrapper; and the DOM write moved to `SarDataBridge.writePeak` (the component's
  job). Added a `getSeriesWithPeak` unit test (peak value/time + empty-section
  defaults). Verified live: peak KPI cards still populate (CPU 15 / Load 44 /
  Memory 5, with peak times).
- [x] **Split `sarData.ts`.** (2026-07-08) Extracted the whole-file aggregation
  layer — `metricStats`, `hourGrid`, the per-metric heatmaps
  (`memoryHeatmap`/`networkHeatmap`/`diskHeatmap`), `cpuAll`, `hostInfo`,
  `cpuCount`, `findKey`, `lines`/`rows`, and the `SarRow`/`MetricStats`/
  `HeatmapGrid` types — into a new `lib/sarStats.ts`, leaving `sarData.ts` as
  just the per-category series getters (570 → 397 lines). Updated the three
  consumers (`AiSummary`, `HeatmapDashboard`, `PlotlyHeatmap`) and added
  `test/sarStats.test.ts` covering `metricStats`/`hourGrid` (max+sum reducers,
  percentiles, filtering)/`cpuAll`/`findKey` — logic previously only exercised
  through components. Verified live: all 7 heatmap panels render.
- [x] **Reconsidered the `delay(0)` step choreography** in `SarDataBridge`.
  (2026-07-08) `dateFilterRefresh` had 7 bare `delay(0)` yields (one after
  nearly every statement — the legacy task-queue artifact). Replaced them with
  a documented `yieldToBrowser()` and cut to the 4 boundaries that actually
  matter for large multi-day files: after the "Filtering..." label paints,
  after the (grouped, fast) KPI recompute, and before each heavy per-category
  Plotly re-render. The genuinely-async per-core rebuild is awaited directly.
  Kept `setTimeout(0)` (not rAF) so the pipeline still completes when the tab
  is backgrounded, and kept `delay(ms)` for the distinct progress-step pacing.
  Note: the yields are load-bearing for large-file responsiveness (the headline
  perf feature), so the goal was to make them intentional and minimal, not to
  remove them.

## Security & deployment

- [x] **Content-Security-Policy (via `helmet`).** (2026-07-08) Added `helmet` to
  `app.js` with an explicit strict policy: `default-src 'self'`, `script-src
  'self'`, `img-src 'self' data:`, `font-src 'self'`, `object-src 'none'`,
  `frame-ancestors 'none'`, and — the privacy-critical one — `connect-src
  'self'`, which *enforces* "files never leave your machine" (the page cannot
  POST an uploaded SAR file anywhere). `style-src` allows `'unsafe-inline'`
  because Plotly injects a `<style>` block and the static 404 uses inline CSS;
  no inline SCRIPT is allowed. To get there I removed the two blockers:
  externalized the anti-FOUC theme setter to `public/js/theme-init.js`
  (blocking `<script src>`), and replaced the inline `onclick` in
  `sarEngine.chartPage` with plain text. Verified live: Plotly renders with no
  `'unsafe-eval'` needed, sample fetch and PDF export work, and the CSP even
  blocks a third-party browser userscript's inline injection.
- [x] **Standard security headers.** (2026-07-08) helmet also sets
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
  `X-Frame-Options: SAMEORIGIN`, HSTS, `Cross-Origin-Opener-Policy`,
  `Cross-Origin-Resource-Policy`, `Origin-Agent-Cluster`, and
  `X-DNS-Prefetch-Control: off` — verified via `curl -D-`.
- [x] **SRI hashes on vendored libs.** (2026-07-08) `LegacyScripts.tsx` now
  attaches a `sha384` `integrity` (+ `crossOrigin`) to each vendored script
  (plotly-cartesian, plotly-charts, html2canvas, jspdf), so a tampered file is
  rejected. Verified live: all four still load (charts render, PDF exports).
  Regeneration command documented in the file.
- [x] **Clarified the `app.get('*path', ...)` wildcard** in `index.js` with a
  comment explaining Express 5 named-wildcard syntax and why it's registered
  last. (2026-07-08)

## Housekeeping

- [x] **Retired `preact-migration-remaining.md`.** (2026-07-08) Folded its
  still-relevant content into a new `CHANGELOG.md` (a `[2.0.0]` entry for the
  Preact/Vite/TS rewrite + an `[Unreleased]` entry for this hardening pass) and
  deleted the "remaining" doc that no longer listed anything remaining.
- [x] **Fixed `package.json` identity.** (2026-07-08) `name: sarkart`,
  `version: 2.0.0` (matches the footer's `v2.0.0`), real description (dropped
  "experimental fork"), `author: Matt Anderson`, `main: src/index.js`, and added
  `repository`/`homepage`/`bugs`/`keywords`. Synced the lockfile's root
  name/version. Tests + build green.

## Done

- [x] **Remove AIX/Solaris support (Linux-only).** (2026-07-08) Stripped every
  AIX/SUNOS branch from the chart renderers; removed the five exclusively
  non-Linux categories (CPU Summary, Memory Allocation, File, TTY, System Calls)
  and their sidebar entries; collapsed the dashboard-init OS branch to Linux with
  a clear unsupported-OS notice for non-Linux files; simplified
  `getHostname`/`getKernel` and dropped the Solaris `%peakMemory` special case;
  updated landing copy, README, and the `sarEngine` unit test. `tsc` clean,
  build passes, 27 tests pass.
