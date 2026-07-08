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
| hbs | 4.2.1 | `404.hbs` view engine only | ✅ Latest |
| handlebars | 4.7.9 | Template compiler (transitive) | ✅ Latest |
| ansi-regex | 6.0.1 | Transitive security override | ✅ |
| nodemon | 3.1.14 | Dev auto-restart | ✅ Latest |
| playwright | 1.59.1 | Dev browser benchmarks / UI shots | ✅ Latest |

Production Docker image installs dev dependencies, builds the Preact bundle, then prunes to production dependencies on Node 22 Alpine (`Dockerfile`).

## Browser libraries (`public/`)

Script libraries are loaded by the Preact shell after mount
(`src/client/components/LegacyScripts.tsx`); `bootstrap.min.css` is a stylesheet
link in the document head.

| Library | File | Version | Notes |
|---------|------|---------|-------|
| Bootstrap (CSS only) | `bootstrap.min.css` | 5.3.6 | Utility classes + `.collapse` display rule; layout is `sarkart-v2.css`. JS bundle removed — collapse is Preact-owned (`SidebarCollapse`) |
| Plotly.js (cartesian) | `plotly-cartesian-3.5.1.min.js` | 3.5.1 | All line/pie/heatmap charts |
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
| `public/css/all.min.css` | Font Awesome 5 — still referenced by `404.hbs` only |
| `public/css/animate.min.css` | Unused; safe to delete |
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

- **Bootstrap 5**: JS bundle (`bootstrap.bundle.min.js`) removed — the sidebar collapse accordion is now handled by the Preact `SidebarCollapse` component. `bootstrap.min.css` (5.3.x) is retained for the `.collapse` display rule and utility classes; the `data-bs-toggle="collapse"` markup is kept as the hook `SidebarCollapse` listens on.
- **jQuery**: Fully removed — no longer loaded and `jquery-4.0.0.min.js` is deleted.
- **Handlebars app shell**: Retired. Express serves `dist/index.html` (the Vite/Preact build); if `dist/` is missing it returns a 503 asking you to run `npm run build`. Handlebars (`hbs`) now backs only `404.hbs`.
- **Plotly**: Pin filename includes version; the Vite build hashes `dist/assets`, so update the vendored `public/js/plotly-cartesian-*.js` filename (and the `LegacyScripts.tsx` reference) when upgrading.
- **Font Awesome / animate.css**: Remove from `404.hbs` and delete files when the 404 page is restyled.
