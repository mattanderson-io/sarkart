# Changelog

All notable changes to SARkart. The format loosely follows
[Keep a Changelog](https://keepachangelog.com/); the app ships a UI version
(shown in the footer) that tracks the major line.

## [Unreleased]

Post-2.0 hardening pass (see `ENGINEERING-REVIEW.md` for the full task list).

### Added
- Strict **Content-Security-Policy** and standard security headers via `helmet`
  in the Express server. `connect-src 'self'` enforces the client-only privacy
  claim (an uploaded SAR file cannot be sent anywhere).
- **Subresource Integrity** (`sha384`) on the vendored browser libraries
  (Plotly, plotly-charts, html2canvas, jsPDF).
- **CI** (GitHub Actions): `typecheck` → `lint` → `test` → `build` on push/PR.
- **ESLint** flat config (type-aware on `src/client`) and a `typecheck`
  (`tsc --noEmit`) npm script.
- Expanded the fixture/unit test suite (data layer, per-core re-index,
  `sarStats` aggregation, engine identity helpers).

### Changed
- **Linux-only.** Removed AIX and Solaris support: dropped the exclusively
  non-Linux categories (CPU Summary, Memory Allocation, File, TTY, System
  Calls) and their nav entries; non-Linux files now show a clear "unsupported"
  notice.
- Retired the `window.*` **data bus**: `sarStore` is the single source of truth
  (typed accessors), replacing the mirrored `window._idx`/`headers`/… globals.
- Retired the importable `window.*` **engine primitives** (`showBlock`,
  `getOS`, `grepHeaders`, …) in favour of direct `sarEngine` imports; only the
  vendored-Plotly interop and a few decorated functions remain on `window`.
- Split `sarData.ts` into per-category series getters + a new `sarStats.ts`
  aggregation module.
- Split `getGenericData` into a pure `getSeriesWithPeak` transform plus a
  component-side DOM writer (`SarDataBridge.writePeak`).
- Made the date-filter refresh's yield choreography explicit (`yieldToBrowser`)
  and reduced to the boundaries that matter for large multi-day files.

### Fixed
- Devices view: the "average time / service-time / %util" chart (`containerD`)
  was drawn and then immediately hidden — it now displays.
- Carried-over multi-OS chart bugs (AIX CPU "idle" copy-paste; AIX processes
  writing three charts to one slot) — removed with AIX/Solaris support.

## [2.0.0]

Complete rewrite to **Preact + Vite + TypeScript + Plotly.js**, retiring the
legacy jQuery / Highcharts / Handlebars / Bootstrap stack.

- Preact/Vite/TypeScript app shell; Express serves the built `dist/`.
- Chunked single-pass SAR parser with an O(1) section index (up to ~20× faster
  than the upstream sarchart parser on large files).
- Plotly.js charts (line/pie/heatmap) with LTTB downsampling.
- Heatmap dashboard, command palette (⌘K), CPU chip bar, network-unit selector,
  date-range filtering, local PDF export, and an AI performance summary
  (Chrome Gemini Nano with a template fallback).
- Dark/light themes; first-party `sarkart-v2.css` design system (no CSS
  framework); inline SVG icon sprite (no Font Awesome).
- All jQuery, Highcharts, Bootstrap, Handlebars, and Font Awesome removed from
  the runtime and disk.
