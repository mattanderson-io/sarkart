/**
 * SARkart AI Summary
 *
 * Generates a natural-language performance summary from parsed SAR data.
 * Progressive enhancement: uses Chrome's built-in Prompt API (Gemini Nano)
 * when available, falls back to a template-based analysis otherwise.
 */
(function () {
  'use strict';

  var THRESHOLDS = {
    cpuHigh: 80,
    cpuCritical: 95,
    memHigh: 80,
    memCritical: 95,
    loadHighPerCore: 2
  };

  function fmt(n) { return typeof n === 'number' ? n.toFixed(1) : '—'; }
  function pluralize(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  function getMetricStats(key, colIndex) {
    var lines = (window._idx && window._idx[key]) || [];
    if (!lines.length) return null;
    var values = [];
    for (var i = 0; i < lines.length; i++) {
      var parts = lines[i].split(',');
      if (key === 'CPU-%usr' && parts[2] !== 'all') continue;
      var v = parseFloat(parts[colIndex]);
      if (!isNaN(v) && isFinite(v)) values.push(v);
    }
    if (!values.length) return null;
    values.sort(function (a, b) { return a - b; });
    var sum = 0;
    for (var j = 0; j < values.length; j++) sum += values[j];
    var mean = sum / values.length;
    var max = values[values.length - 1];
    var min = values[0];
    var p95 = values[Math.floor(values.length * 0.95)];
    var p50 = values[Math.floor(values.length * 0.5)];
    var highCount = 0;
    var threshold = key.indexOf('CPU') >= 0 ? THRESHOLDS.cpuHigh : THRESHOLDS.memHigh;
    for (var k = 0; k < values.length; k++) {
      if (values[k] >= threshold) highCount++;
    }
    return { mean: mean, max: max, min: min, p95: p95, p50: p50, count: values.length, highCount: highCount };
  }

  // --- Template-based summary (always works) ---
  function generateSummary() {
    var sentences = [];
    var hostname = '', os = '', days = 0;
    try { hostname = (typeof getHostname === 'function' ? getHostname() : '') || 'this server'; } catch (e) { hostname = 'this server'; }
    try { os = (typeof getOS === 'function' ? getOS() : '') || ''; } catch (e) {}
    days = (window._allDatesArr && window._allDatesArr.length) || 0;

    var intro = 'Performance analysis for ' + hostname;
    if (os) intro += ' (' + os + ')';
    if (days > 1) intro += ' covering ' + pluralize(days, 'day');
    else if (days === 1) intro += ' for a single day';
    intro += '.';
    sentences.push(intro);

    var peakCPU = parseInt((document.getElementById('peakCPU') || {}).textContent || '0');
    var peakCPUTime = ((document.getElementById('peakCPUTime') || {}).textContent || '').trim();
    var cpuStats = getMetricStats('CPU-%usr', 3);

    if (cpuStats) {
      if (peakCPU >= THRESHOLDS.cpuCritical) {
        sentences.push('CPU reached a critical peak of ' + peakCPU + '%' + (peakCPUTime ? ' at ' + peakCPUTime : '') + '. Average utilization was ' + fmt(cpuStats.mean) + '% with a p95 of ' + fmt(cpuStats.p95) + '%.');
      } else if (peakCPU >= THRESHOLDS.cpuHigh) {
        sentences.push('CPU peaked at ' + peakCPU + '%' + (peakCPUTime ? ' at ' + peakCPUTime : '') + ', elevated but not critical. Average was ' + fmt(cpuStats.mean) + '%.');
      } else {
        sentences.push('CPU utilization remained healthy, peaking at only ' + peakCPU + '% with an average of ' + fmt(cpuStats.mean) + '%.');
      }
      if (cpuStats.highCount > 0) {
        var pctHigh = ((cpuStats.highCount / cpuStats.count) * 100).toFixed(0);
        if (pctHigh > 20) {
          sentences.push('CPU was above ' + THRESHOLDS.cpuHigh + '% for approximately ' + pctHigh + '% of all readings — indicating sustained pressure.');
        } else if (pctHigh > 5) {
          sentences.push('CPU exceeded ' + THRESHOLDS.cpuHigh + '% in about ' + pctHigh + '% of readings — occasional spikes but not sustained.');
        }
      }
    }

    var peakMem = parseInt((document.getElementById('peakMemory') || {}).textContent || '0');
    if (peakMem) {
      if (peakMem >= THRESHOLDS.memCritical) {
        sentences.push('Memory utilization hit ' + peakMem + '%, critically high — potential OOM risk.');
      } else if (peakMem >= THRESHOLDS.memHigh) {
        sentences.push('Memory peaked at ' + peakMem + '% — elevated but within operational bounds.');
      } else {
        sentences.push('Memory usage was comfortable, peaking at ' + peakMem + '%.');
      }
    }

    var peakLoad = (document.getElementById('peakLoad') || {}).textContent || '';
    if (peakLoad && !isNaN(parseInt(peakLoad))) {
      var loadVal = parseInt(peakLoad);
      var cpuCount = document.querySelectorAll('#ulCPU li').length || 1;
      var loadPerCore = loadVal / Math.max(cpuCount, 1);
      if (loadPerCore >= THRESHOLDS.loadHighPerCore) {
        sentences.push('System load peaked at ' + loadVal + ' (' + fmt(loadPerCore) + ' per core across ' + cpuCount + ' cores), suggesting run queue saturation.');
      } else {
        sentences.push('System load remained manageable at a peak of ' + loadVal + ' across ' + cpuCount + ' cores.');
      }
    }

    var issues = 0;
    if (peakCPU >= THRESHOLDS.cpuHigh) issues++;
    if (peakMem >= THRESHOLDS.memHigh) issues++;
    if (peakLoad && parseInt(peakLoad) / Math.max(document.querySelectorAll('#ulCPU li').length, 1) >= THRESHOLDS.loadHighPerCore) issues++;

    if (issues === 0) {
      sentences.push('Overall, this server appears healthy with no significant resource pressure detected.');
    } else if (issues === 1) {
      sentences.push('One area of concern was identified — review the highlighted metric for optimization opportunities.');
    } else {
      sentences.push('Multiple resource pressure points detected (' + issues + ' metrics exceeded thresholds). Investigation into workload distribution or capacity planning is recommended.');
    }

    return sentences.join(' ');
  }

  // --- Build stats context string for the AI prompt ---
  function buildStatsContext() {
    var lines = [];
    var hostname = '', os = '', days = 0;
    try { hostname = (typeof getHostname === 'function' ? getHostname() : '') || 'Unknown'; } catch (e) {}
    try { os = (typeof getOS === 'function' ? getOS() : '') || 'Unknown'; } catch (e) {}
    days = (window._allDatesArr && window._allDatesArr.length) || 0;

    lines.push('Host: ' + hostname);
    lines.push('OS: ' + os);
    lines.push('Days of data: ' + days);

    var peakCPU = (document.getElementById('peakCPU') || {}).textContent || '—';
    var peakCPUTime = (document.getElementById('peakCPUTime') || {}).textContent || '—';
    var peakMem = (document.getElementById('peakMemory') || {}).textContent || '—';
    var peakLoad = (document.getElementById('peakLoad') || {}).textContent || '—';
    var cpuCount = document.querySelectorAll('#ulCPU li').length || '?';

    lines.push('Peak CPU: ' + peakCPU + '% at ' + peakCPUTime);
    lines.push('Peak Memory: ' + peakMem + '%');
    lines.push('Peak Load: ' + peakLoad);
    lines.push('CPU cores: ' + cpuCount);

    var cpuStats = getMetricStats('CPU-%usr', 3);
    if (cpuStats) {
      lines.push('CPU mean: ' + fmt(cpuStats.mean) + '%, p50: ' + fmt(cpuStats.p50) + '%, p95: ' + fmt(cpuStats.p95) + '%, max: ' + fmt(cpuStats.max) + '%');
      lines.push('CPU readings above 80%: ' + cpuStats.highCount + ' out of ' + cpuStats.count + ' (' + ((cpuStats.highCount / cpuStats.count) * 100).toFixed(1) + '%)');
    }

    return lines.join('\n');
  }

  // --- Chrome Built-in AI (Prompt API) ---
  async function tryAISummary(statsContext) {
    try {
      if (!self.ai || !self.ai.languageModel) return null;

      var availability = await self.ai.languageModel.availability();
      if (availability === 'unavailable') return null;
      if (availability === 'downloadable' || availability === 'downloading') {
        console.log('[SARkart] Chrome AI model is ' + availability + '; using template summary.');
        return null;
      }

      var session = await self.ai.languageModel.create({
        systemPrompt: 'You are a Unix systems performance analyst. Given SAR (System Activity Report) metrics, provide a concise 3-4 sentence performance summary. Be specific about numbers. Mention any concerns and whether the server appears healthy. Do not use markdown formatting.'
      });

      var prompt = 'Analyze this server performance data and provide a brief summary:\n\n' + statsContext;
      var result = await session.prompt(prompt);
      session.destroy();
      return result;
    } catch (e) {
      console.log('[SARkart] Chrome AI unavailable:', e.message || e);
      return null;
    }
  }

  // --- UI: create the summary panel ---
  function createSummaryPanel() {
    var existing = document.getElementById('aiSummaryPanel');
    if (existing) existing.remove();

    var panel = document.createElement('div');
    panel.id = 'aiSummaryPanel';
    panel.className = 'ai-summary-panel homeContBlock';
    panel.innerHTML =
      '<div class="ai-summary-header">' +
        '<span class="ai-summary-icon"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l3 7-9 11L3 10z"/><path d="M12 3v18"/></svg></span>' +
        '<span class="ai-summary-title">Performance Summary</span>' +
        '<button class="ai-summary-close" title="Dismiss" aria-label="Dismiss summary">&times;</button>' +
      '</div>' +
      '<div class="ai-summary-body">' +
        '<p class="ai-summary-text"></p>' +
      '</div>';

    var peakBlock = document.getElementById('peakBlock');
    if (peakBlock && peakBlock.parentNode) {
      peakBlock.parentNode.insertBefore(panel, peakBlock.nextSibling);
    } else {
      var content = document.getElementById('content');
      if (content) content.querySelector('section').appendChild(panel);
    }

    panel.querySelector('.ai-summary-close').addEventListener('click', function () {
      panel.style.display = 'none';
    });

    return panel;
  }

  // --- Show summary: template first, then upgrade with AI if available ---
  function showSummary() {
    var panel = createSummaryPanel();
    var textEl = panel.querySelector('.ai-summary-text');

    // Show template summary immediately
    textEl.textContent = generateSummary();

    // Try Chrome AI for a richer summary (async, replaces template if successful)
    var statsContext = buildStatsContext();
    tryAISummary(statsContext).then(function (aiText) {
      if (aiText && aiText.trim()) {
        textEl.textContent = aiText.trim();
        var badge = document.createElement('span');
        badge.className = 'ai-summary-badge';
        badge.textContent = 'Gemini Nano';
        panel.querySelector('.ai-summary-header').appendChild(badge);
      }
    });
  }

  // --- Trigger: show summary when dashboard data is ready ---
  function waitForData() {
    var el = document.getElementById('peakCPU');
    if (!el) return setTimeout(waitForData, 500);

    var observer = new MutationObserver(function () {
      var val = (el.textContent || '').trim();
      if (val && /\d/.test(val)) {
        observer.disconnect();
        setTimeout(showSummary, 500);
      }
    });
    observer.observe(el, { childList: true, characterData: true, subtree: true });

    var val = (el.textContent || '').trim();
    if (val && /\d/.test(val)) {
      observer.disconnect();
      setTimeout(showSummary, 500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForData);
  } else {
    waitForData();
  }
})();
