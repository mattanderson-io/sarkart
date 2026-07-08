# SARkart Dependencies

Last reviewed: July 2026 (v2 UI).

## Node.js / app shell

Requires **Node 18+** for Vite / Playwright benchmarks; **Node 24 LTS** recommended (see `.nvmrc`).

| Package | Installed | Role | Status |
|---------|-----------|------|--------|
| express | 5.2.1 | HTTP server | ✅ Current |
| preact | 10.29.6 | Main app shell | ✅ Current |
| vite | 8.1.3 | Frontend build/dev server | ✅ Current |
| @preact/preset-vite | 2.10.5 | Preact/Vite integration | ✅ Current |
| typescript | 6.0.3 | TSX type checking / source language | ✅ Current |
| ansi-regex | 6.0.1 | Transitive security override | ✅ |
| nodemon | 3.1.14 | Dev auto-restart | ✅ Latest |
| playwright | 1.59.1 | Dev browser benchmarks / UI shots | ✅ Latest |

Production Docker image installs dev dependencies, builds the Preact bundle, then prunes to production dependencies on Node 22 Alpine (`Dockerfile`).

## Browser libraries (`public/`)

Script libraries loaded by the Preact shell after mount
(`src/client/components/LegacyScripts.tsx`). The only stylesheet is the
first-party `sarkart-v2.css` — no CSS framework.

| Library | File | Version | Notes |
|---------|------|---------|-------|
| Plotly.js (cartesian) | `plotly-cartesian-3.7.0.min.js` | 3.7.0 | All line/pie/heatmap charts |
| html2canvas | `html2canvas.min.js` | 1.4.1 | PDF export screenshots |
| jsPDF | `jspdf.umd.min.js` | 2.5.2 | PDF export |

## First-party browser modules

| Module | Purpose |
|--------|---------|
| Preact `CoreEngineBridge` + `sarEngine` | Core navigation/engine primitives (showBlock, chartPage, homePage, server info) — replaces `sarkart-v1.0.0.min.js` |
| Preact `SarDataBridge` + `sarParser` / `sarStore` | Chunked parser, typed SAR data store, legacy global mirror, dashboard bootstrap |
| Preact `ChartRouterBridge` + `sarData` | Chart category routing + typed chart data helpers — replaces the legacy engine's chart plumbing |
| Preact `FileUploadBridge` | Drag-and-drop + browse upload pipeline — replaces the legacy `makeDroppable` / `getAsText` |
| Preact `SidebarCollapse` | Sidebar submenu accordion (toggle `.show` + `aria-expanded`) — replaces `bootstrap.bundle.min.js` |
| `plotly-charts.js` | Plotly replacements for `printChart` / `printMultiChart` / `printPieChart` |
| Preact `NetworkUnitBridge` | Interface traffic unit selector (KB/s, Mbps, Gbps, % of link speed) |
| Preact `UiBridge` + `legacyUi` | Progress stage/rate, `chartPage` fast path, keyboard shortcuts, sidebar collapse toggle, empty-section-label hiding, CPU chip bar, `is-dashboard` state — replaces `sarkart-ui.js` |
| Preact `LandingBridge` | Upload lifecycle, sample data, loaded state, file info, title helpers |
| Preact `HeatmapDashboard` | Heatmap dashboard (7 panels) |
| Preact `PdfExportBridge` | Multi-page PDF report |
| Preact `AiSummary` | Performance summary (Gemini Nano or template fallback) |

## Fonts & icons

| Asset | Location | Notes |
|-------|----------|-------|
| Inter (variable) | `public/fonts/inter/` | UI text |
| JetBrains Mono | `public/fonts/jetbrains-mono/` | Numbers, code |
| SVG icon sprite | Preact `IconSprite` (`src/client/components/IconSprite.tsx`) | Replaces Font Awesome in v2 UI |

## Legacy static files (not used by main app)

These remain on disk but are **not linked** from the Preact app shell:

| File | Notes |
|------|-------|
| `public/css/sarkart-v1.0.0.min.css` | Removed in v2 |
| `public/css/theme-override.css` | Removed in v2 |
| `public/js/faq.js` | Removed in v2 |
| `public/js/sarkart-v1.0.0.min.js` | **Deleted** — legacy engine fully ported to Preact bridges |
| `public/js/highcharts-shim.js` | **Deleted** — Plotly load-order stub no longer needed |
| `public/js/bootstrap.bundle.min.js` | **Deleted** — sidebar collapse ported to the Preact `SidebarCollapse` component (`bootstrap.min.css` retained) |
| `public/js/sarkart-ui.js` | **Deleted** — remaining UI behaviors ported to the Preact `UiBridge` / `legacyUi` |
| `public/js/jquery-4.0.0.min.js` | **Deleted** — the Handlebars `index.hbs` fallback that referenced it was retired |
| `templates/views/index.hbs` + `partials/{icons,sidebar,content,footer}.hbs` | **Deleted** — Handlebars app shell retired; `dist/index.html` (Preact) is the only entry point |
| `public/js/{network-units,sar-chunked-parser,export-pdf,landing,ai-summary,heatmap}.js` | **Deleted** — orphaned once `index.hbs` was retired; superseded by the Preact `NetworkUnitBridge` / `sarParser` / `PdfExportBridge` / `LandingBridge` / `AiSummary` / `HeatmapDashboard` |
| `public/css/bootstrap.min.css` | **Deleted** — the used rules (border-box reset, `.collapse`/`.list-unstyled`/`.d-none`/`.d-block`, Reboot typography) are ported into `sarkart-v2.css` |
| `public/css/all.min.css` (Font Awesome) + `public/css/animate.min.css` | **Deleted** — only the retired `404.hbs` referenced them; `404.html` is self-contained |
| `templates/views/404.hbs` | **Deleted** — replaced by static `public/404.html` served via `sendFile`; the `hbs` view engine and `hbs`/`handlebars` deps are removed |
| `templates/` (empty `views/` + `partials/` dirs) | **Deleted** — no Handlebars views remain; `Dockerfile` no longer `COPY`s `templates/` |
| `public/webfonts/` (Font Awesome ttf/woff2) | **Deleted** — orphaned once `all.min.css` was removed; no glyph font is loaded |

## Testing

Fixture-based regression tests live in `test/` and run on Node's built-in test
runner with native TypeScript type-stripping — **no test dependencies** (`npm test`,
which runs `node --test test/*.test.ts`). `test/regression.test.ts` parses the
bundled `public/sample/sample-sar.txt` through the real `parseSarTextChunked`
and locks in the data-layer output the dashboard renders: server metadata, the
18 parsed section keys, peak CPU/load/memory (15/44/5), CPU/device/interface
counts (65/11/11), representative series shape, and `sarStore` date filtering.

The suite lives outside `src/client`, so it is excluded from the Vite build and
the app's `tsc` typecheck and needs no `@types/node`.

## Security audit

As of July 2026 (`npm audit`):

- **1 moderate** — transitive `qs` DoS advisory ([GHSA-q8mj-m7cp-5q26](https://github.com/advisories/GHSA-q8mj-m7cp-5q26)); fix with `npm audit fix` when convenient.

Browser-side libraries are vendored minified files — audit separately when upgrading.

## Upgrade notes

- **Bootstrap**: Fully removed (JS bundle and `bootstrap.min.css`). The handful of rules the app used — the global `box-sizing:border-box`, `.collapse`/`.list-unstyled`/`.d-none`/`.d-block`, and Reboot's typography baseline — are ported into `sarkart-v2.css`'s base section. `data-bs-toggle="collapse"` markup is kept purely as the hook the Preact `SidebarCollapse` listens on.
- **jQuery**: Fully removed — no longer loaded and `jquery-4.0.0.min.js` is deleted.
- **Handlebars**: Fully retired — `hbs`/`handlebars` deps removed and no view engine is configured. Express serves `dist/index.html` (the Vite/Preact build), returns a 503 if `dist/` is missing, and serves the static `public/404.html` for unmatched routes.
- **Font Awesome / animate.css**: Fully removed — `all.min.css`, `animate.min.css`, and the `public/webfonts/` FA font files are all deleted. Icons are an inline SVG sprite; the sidebar submenu `i.fa` markers are styled as plain CSS dots (no glyph font).
- **Plotly**: Pin filename includes version; the Vite build hashes `dist/assets`, so update the vendored `public/js/plotly-cartesian-*.js` filename (and the `LegacyScripts.tsx` reference) when upgrading.
