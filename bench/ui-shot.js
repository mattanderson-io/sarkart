// Dev helper: capture screenshots of the running app for visual review.
// Usage: node bench/ui-shot.js <outdir> [theme]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const outDir = process.argv[2] || '/tmp/sarkart-shots';
const theme = process.argv[3] || 'dark';
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text()); });
  page.on('pageerror', e => console.log('[pageerror]', e.message));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  if (theme === 'light') {
    await page.evaluate(() => {
      localStorage.setItem('sarkart-theme', 'light');
    });
    await page.reload({ waitUntil: 'networkidle' });
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, '01-landing.png') });

  // Load sample data
  const sampleLink = page.locator('#btnTrySample, a:has-text("sample data")').first();
  if (await sampleLink.count()) {
    await sampleLink.click();
    await page.waitForTimeout(6000);
    await page.screenshot({ path: path.join(outDir, '02-dashboard.png') });

    async function clickIfVisible(sel) {
      const el = page.locator(sel).first();
      if (await el.count() && await el.isVisible()) { await el.click(); return true; }
      return false;
    }

    // CPU chart (dropdown -> first per-CPU entry, else summary button)
    if (await clickIfVisible('#btnCPUs')) {
      await page.waitForTimeout(600);
      await clickIfVisible('#ulCPU li a');
      await page.waitForTimeout(2500);
      await page.screenshot({ path: path.join(outDir, '03-cpu-chart.png') });
    } else if (await clickIfVisible('#btnCPU')) {
      await page.waitForTimeout(2500);
      await page.screenshot({ path: path.join(outDir, '03-cpu-chart.png') });
    }

    // Memory used
    if (await clickIfVisible('#btnMem')) {
      await page.waitForTimeout(600);
      if (await clickIfVisible('#btnMemUsg')) {
        await page.waitForTimeout(2000);
        await page.screenshot({ path: path.join(outDir, '04-memory-chart.png') });
      }
    }

    // Heatmaps
    const btnHeat = page.locator('#btnHeatmap, a:has-text("Heatmaps")').first();
    if (await btnHeat.count()) {
      await btnHeat.click({ force: true });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(outDir, '05-heatmaps.png'), fullPage: false });
      await page.evaluate(() => { const c = document.getElementById('content'); if (c) c.scrollTop = 1200; });
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(outDir, '06-heatmaps-scrolled.png') });
    }

    // Back to dashboard
    const btnSAR = page.locator('#btnSAR');
    if (await btnSAR.count()) {
      await btnSAR.click({ force: true });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(outDir, '07-dashboard-again.png') });
    }
  }

  await browser.close();
  console.log('Screenshots written to ' + outDir);
})().catch(e => { console.error(e); process.exit(1); });
