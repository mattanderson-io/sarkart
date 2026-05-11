# SARkart

A fast, local tool for viewing Unix SAR (System Activity Report) data as interactive charts. Built by Matt Anderson, inspired by [SARchart](https://github.com/sargraph/sargraph.github.io).

![SARkart Dashboard](docs/screenshot-dashboard.png)

<details>
<summary>More screenshots</summary>

**Landing page**
![Landing](docs/screenshot-landing.png)

**CPU chart (interactive)**
![CPU Chart](docs/screenshot-cpu-chart.png)

**Heatmap dashboard**
![Heatmaps](docs/screenshot-heatmaps.png)

</details>

## Features

- **Up to 20× faster** than sarchart — a 313 MB RHEL 9 SAR file loads in ~2 seconds
- **Interactive charts** powered by Plotly.js — zoom, pan, drag-to-select, unified hover tooltips
- **Heatmap dashboard** — 7 time-of-day × date heatmaps (CPU, Memory, I/O Wait, Load, Swap, Network, Disk) for instant pattern recognition
- **AI-powered summary** — natural-language performance analysis (uses Chrome's Gemini Nano when available, template fallback everywhere else)
- **Client-side only** — all parsing happens in your browser. Files never leave your machine.
- **PDF export** — generate a multi-page report locally
- **Date range filtering** — view a single day or custom range from multi-day SAR files
- **Supports** Linux (RHEL, SuSE, Ubuntu), AIX, and Solaris

## Quick Start

```bash
# Clone and install
git clone https://github.com/mattanderson-io/sarkart.git
cd SARkart
npm install

# Run
npm start
# Open http://localhost:3000
```

Or with Docker:

```bash
docker build -t sarkart .
docker run -p 3000:3000 sarkart
```

## Try It

Click **"Try with sample data"** on the landing page to load a bundled 1-day SAR file without needing your own data.

## How to Generate a SAR File

```bash
# Linux — single day
sar -A -f /var/log/sa/sa$(date +%d) > /tmp/sar_$(uname -n).txt

# Linux — all days
ls /var/log/sa/sa?? | xargs -i sar -A -f {} > /tmp/sar_$(uname -n).txt
```

Upload the resulting `.txt` file to SARkart.

## Development

```bash
npm run dev    # auto-restart on file changes (uses nodemon)
```

### Benchmarks

See [PERFORMANCE.md](PERFORMANCE.md) for parse-only and end-to-end browser benchmarks.

```bash
# Run parse benchmark
node bench/parse-bench.js

# Run browser benchmark (requires Playwright)
node bench/browser-bench.js
```

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Server | Express | 5.2.1 |
| Templates | Handlebars (hbs) | 4.2.1 |
| Charts | Plotly.js (cartesian) | 3.5.1 |
| UI Framework | Bootstrap | 5.3.6 |
| Icons | Font Awesome | 6.7.2 |
| DOM | jQuery | 4.0.0 |

## License

[GPLv3](LICENSE)
