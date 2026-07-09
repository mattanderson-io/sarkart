// Dev helper: capture screenshots of the running app for visual review / README.
// Usage:
//   node bench/ui-shot.js [outdir] [theme]
//   node bench/ui-shot.js docs          # writes README filenames into docs/
//   node bench/ui-shot.js /tmp/shots dark
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const outArg = process.argv[2] || '/tmp/sarkart-shots';
const theme = process.argv[3] || 'dark';
const docsMode = outArg === 'docs';
const outDir = docsMode ? path.join(__dirname, '..', 'docs') : outArg;
fs.mkdirSync(outDir, { recursive: true });

function shotName(base, docsKey) {
  return docsMode ? docsKey : base;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text()); });
  page.on('pageerror', e => console.log('[pageerror]', e.message));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  if (theme === 'light') {
    await page.evaluate(() => localStorage.setItem('sarkart-theme', 'light'));
    await page.reload({ waitUntil: 'networkidle' });
  }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outDir, shotName('01-landing.png', 'screenshot-landing.png')) });

  const sampleLink = page.locator('#btnTrySample, a:has-text("sample data")').first();
  if (!(await sampleLink.count())) {
    await browser.close();
    throw new Error('Sample data link not found — is the dev server running on :3000?');
  }

  await sampleLink.click();
  await page.waitForFunction(() => {
    const peak = document.getElementById('peakCPU');
    const dashboard = document.getElementById('diagnosticDashboard');
    return peak && /\d/.test((peak.textContent || '').trim()) && dashboard && dashboard.offsetHeight > 0;
  }, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, shotName('02-dashboard.png', 'screenshot-dashboard.png')) });

  async function clickIfVisible(sel) {
    const el = page.locator(sel).first();
    if (await el.count() && await el.isVisible()) {
      await el.click();
      return true;
    }
    return false;
  }

  // CPU chart with chip bar (#ulCPU links are hidden; proxy-click via JS)
  const cpuClicked = await page.evaluate(() => {
    var link = document.querySelector('#ulCPU a');
    if (!link) return false;
    link.click();
    return true;
  });
  if (cpuClicked) {
    await page.waitForFunction(() => document.querySelector('#containerA .plot-container, #containerA .js-plotly-plot'), null, { timeout: 15000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(outDir, shotName('03-cpu-chart.png', 'screenshot-cpu-chart.png')) });
  }

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const freshSampleLink = page.locator('#btnTrySample, a:has-text("sample data")').first();
  await freshSampleLink.click();
  await page.waitForFunction(() => {
    const peak = document.getElementById('peakCPU');
    const dashboard = document.getElementById('diagnosticDashboard');
    return peak && /\d/.test((peak.textContent || '').trim()) && dashboard && dashboard.offsetHeight > 0;
  }, null, { timeout: 60000 });

  const btnHeat = page.locator('#btnHeatmap, a:has-text("Heatmaps")').first();
  if (await btnHeat.count()) {
    await btnHeat.click({ force: true });
    await page.waitForFunction(() => document.querySelector('#heatmapBlock .heatmap-grid, #containerA .heatmap-grid'), null, { timeout: 15000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(outDir, shotName('05-heatmaps.png', 'screenshot-heatmaps.png')) });
  }

  await browser.close();
  console.log('Screenshots written to ' + outDir);
})().catch(e => { console.error(e); process.exit(1); });
