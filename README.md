# SARkart Plotly (experimental)

An experimental fork of [SARkart](../sarkart) that swaps the rendering
engine from **Highcharts** to **Plotly.js** (MIT licensed).

This is a work in progress. The main SARkart still uses Highcharts; this
fork exists to explore the Plotly path without destabilizing the stable
tool.

## Why a fork

- Highcharts is under a proprietary dual license that requires a paid
  license for most commercial use. Plotly.js is MIT-licensed and free for
  any use.
- Plotly's `x unified` hover, synced zoom, brush selection, and
  self-contained HTML export open up features (unified crosshair, CPU
  heatmap, interactive HTML reports) that Highcharts cannot match without
  significant custom code.
- Plotly's SVG renderer is noticeably slower than Highcharts for very large
  SAR datasets (30 days × thousands of samples per day). This fork is where
  we iterate on that tradeoff.

## What's different from SARkart

- Bundles `public/js/plotly-cartesian-3.5.1.min.js` (Plotly partial bundle,
  MIT, 1.4 MB)
- Adds `public/js/plotly-charts.js` which replaces the `printChart`,
  `printMultiChart`, and `printPieChart` functions in the SARkart bundle
  with Plotly equivalents
- `templates/views/index.hbs` loads both of the above

Everything else (parser, index, date filter, PDF export, theme) is
inherited from SARkart unchanged.

## Performance notes

- Series are downsampled to 2000 points via LTTB (Largest Triangle Three
  Buckets) before rendering. Visually indistinguishable from raw for
  line charts, ~10× faster to render.
- `line.simplify: true` collapses collinear path segments in the SVG.
- Window resizes are debounced instead of using Plotly's ResizeObserver.
- For truly massive datasets the next step is to switch to the `gl2d`
  bundle and use `scattergl` (WebGL-accelerated). Not done yet.

## Run

```bash
npm install
npm start
```

Open http://localhost:3000/

## Upstream

Based on [SARkart](https://github.com/zstar125/SARkart), which is itself a
fork of [SARchart](https://github.com/sargraph/sargraph.github.io) by
Suresh Raju (GPLv3).

## License

GNU General Public License v3.0 (same as SARkart).

## Credits

- Charts: [Plotly.js](https://github.com/plotly/plotly.js) (MIT)
- PDF: [jsPDF](https://github.com/parallax/jsPDF) + [html2canvas](https://html2canvas.hertzen.com/)
