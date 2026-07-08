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
| hbs | 4.2.1 | Legacy fallback + 404 view engine | ✅ Latest |
| handlebars | 4.7.9 | Template compiler (transitive) | ✅ Latest |
| ansi-regex | 6.0.1 | Transitive security override | ✅ |
| nodemon | 3.1.14 | Dev auto-restart | ✅ Latest |
| playwright | 1.59.1 | Dev browser benchmarks / UI shots | ✅ Latest |

Production Docker image installs dev dependencies, builds the Preact bundle, then prunes to production dependencies on Node 22 Alpine (`Dockerfile`).

## Browser libraries (`public/`)

Loaded by the Preact shell after mount (`src/client/components/LegacyScripts.tsx`):

| Library | File | Version | Notes |
|---------|------|---------|-------|
| jQuery | `jquery-4.0.0.min.js` | 4.0.0 | Required by the remaining legacy engine |
| Bootstrap | `bootstrap.min.css`, `bootstrap.bundle.min.js` | 5.3.6 | Collapse/sidebar only; layout is `sarkart-v2.css` |
| Plotly.js (cartesian) | `plotly-cartesian-3.5.1.min.js` | 3.5.1 | All line/pie/heatmap charts |
| html2canvas | `html2canvas.min.js` | 1.4.1 | PDF export screenshots |
| jsPDF | `jspdf.umd.min.js` | 2.5.2 | PDF export |

## First-party browser modules

| Module | Purpose |
|--------|---------|
| `sarkart-v1.0.0.min.js` | Remaining legacy chart data helpers + navigation engine (minified upstream) |
| Preact `SarDataBridge` + `sarParser` / `sarStore` | Chunked parser, typed SAR data store, legacy global mirror, dashboard bootstrap |
| `highcharts-shim.js` | Load-order stub before Plotly overrides |
| `plotly-charts.js` | Plotly replacements for `printChart` / `printMultiChart` / `printPieChart` |
| Preact `NetworkUnitBridge` | Interface traffic unit selector (KB/s, Mbps, Gbps, % of link speed) |
| `sarkart-ui.js` | Remaining legacy bridge: progress, CPU chips, sidebar, dashboard state |
| Preact `LandingBridge` | Upload lifecycle, sample data, loaded state, file info, title helpers |
| Preact `HeatmapDashboard` | Heatmap dashboard (7 panels) |
| Preact `PdfExportBridge` | Multi-page PDF report |
| Preact `AiSummary` | Performance summary (Gemini Nano or template fallback) |

## Fonts & icons

| Asset | Location | Notes |
|-------|----------|-------|
| Inter (variable) | `public/fonts/inter/` | UI text |
| JetBrains Mono | `public/fonts/jetbrains-mono/` | Numbers, code |
| SVG icon sprite | `templates/partials/icons.hbs` | Replaces Font Awesome in v2 UI |

## Legacy static files (not used by main app)

These remain on disk but are **not linked** from `index.hbs` after the v2 overhaul:

| File | Notes |
|------|-------|
| `public/css/all.min.css` | Font Awesome 5 — still referenced by `404.hbs` only |
| `public/css/animate.min.css` | Unused; safe to delete |
| `public/css/sarkart-v1.0.0.min.css` | Removed in v2 |
| `public/css/theme-override.css` | Removed in v2 |
| `public/js/faq.js` | Removed in v2 |

## Security audit

As of July 2026 (`npm audit`):

- **1 moderate** — transitive `qs` DoS advisory ([GHSA-q8mj-m7cp-5q26](https://github.com/advisories/GHSA-q8mj-m7cp-5q26)); fix with `npm audit fix` when convenient.

Browser-side libraries are vendored minified files — audit separately when upgrading.

## Upgrade notes

- **Bootstrap 5**: Already on 5.3.x; sidebar uses `data-bs-toggle` collapse.
- **jQuery 4**: Major bump from 3.x; keep when testing legacy engine paths after upgrades.
- **Plotly**: Pin filename includes version; update both file and `index.hbs` cache-bust if upgrading.
- **Font Awesome / animate.css**: Remove from `404.hbs` and delete files when the 404 page is restyled.
