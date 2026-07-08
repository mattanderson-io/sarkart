/**
 * SARkart Plotly chart overrides.
 *
 * Replaces Highcharts-based printChart / printMultiChart / printPieChart
 * with Plotly equivalents that preserve the existing function signatures,
 * so no changes are required in the rest of sarkart-v1.0.0.min.js.
 *
 * Signatures (from the upstream Highcharts implementation):
 *   printChart(containerId, yMin, yMax, yAxisTitle, yTickInterval, color, data)
 *   printMultiChart(containerId, title, yAxisTitle, yTickInterval, series)
 *   printPieChart(containerId, value, color)
 *
 * Notes:
 *   - yTickInterval is IGNORED on purpose. Highcharts treated it as an advisory
 *     hint and auto-adjusted when the hint would produce too many ticks.
 *     Plotly's `dtick` is literal ("put a tick every N units"), so forwarding
 *     the Highcharts value produced millions of stacked, unreadable labels.
 *     Plotly's automatic tick selection is good enough on its own.
 */
(function () {
  'use strict';

  // -- Theme (reads CSS custom properties from sarkart-v2.css) ----------------
  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }

  function themeColors() {
    return {
      accent: cssVar('--accent', '#ffa02e'),
      ink: cssVar('--text-1', '#e8ecf4'),
      paper: 'rgba(0,0,0,0)',
      plot: cssVar('--chart-plot-bg', '#10151d'),
      grid: cssVar('--chart-grid', '#1d2532'),
      text: cssVar('--chart-axis', '#67728a'),
      hoverBg: cssVar('--chart-hover-bg', '#1b2230'),
      hoverBorder: cssVar('--chart-hover-border', '#2e394c'),
      hoverText: cssVar('--chart-hover-text', '#e8ecf4'),
      font: cssVar('--font-ui', 'Inter var, sans-serif')
    };
  }

  var MULTI_PALETTE = [
    '#ffa02e', '#6cb2ff', '#4ade80', '#f87171',
    '#a78bfa', '#f472b6', '#22d3ee', '#fbbf24'
  ];

  var CHART_HEIGHT         = 400;   // px, forced on chart containers
  var MAX_POINTS_PER_SERIES = 2000; // LTTB target after downsampling

  // -- Utilities --------------------------------------------------------------

  function isNum(v) {
    return typeof v === 'number' && v === v && v !== Infinity && v !== -Infinity;
  }

  // Split [[x, y], ...] into { x: [...], y: [...] } with NaN/Infinity -> null
  // so Plotly draws gaps instead of drawing through them.
  function splitXY(data) {
    var n = data.length;
    var xs = new Array(n);
    var ys = new Array(n);
    for (var i = 0; i < n; i++) {
      xs[i] = data[i][0];
      var v = data[i][1];
      ys[i] = isNum(v) ? v : null;
    }
    return { x: xs, y: ys };
  }

  /**
   * Largest-Triangle-Three-Buckets downsampling. O(n).
   * Preserves visual shape of time-series data far better than stride sampling.
   * See Sveinn Steinarsson, "Downsampling Time Series for Visual Representation" (2013).
   */
  function lttb(data, threshold) {
    var n = data.length;
    if (threshold >= n || threshold < 3) return data;

    var sampled = new Array(threshold);
    var bucketSize = (n - 2) / (threshold - 2);
    var a = 0;
    sampled[0] = data[0];
    var sampledIdx = 1;

    for (var i = 0; i < threshold - 2; i++) {
      var avgStart = Math.floor((i + 1) * bucketSize) + 1;
      var avgEnd   = Math.floor((i + 2) * bucketSize) + 1;
      if (avgEnd >= n) avgEnd = n;
      var avgRange = avgEnd - avgStart;
      if (avgRange === 0) avgRange = 1;
      var avgX = 0, avgY = 0;
      for (var j = avgStart; j < avgEnd; j++) {
        avgX += data[j][0];
        avgY += data[j][1] || 0;
      }
      avgX /= avgRange;
      avgY /= avgRange;

      var rangeStart = Math.floor(i * bucketSize) + 1;
      var rangeEnd   = Math.floor((i + 1) * bucketSize) + 1;
      var pointAX = data[a][0], pointAY = data[a][1] || 0;
      var maxArea = -1;
      var maxIdx = rangeStart;

      for (var k = rangeStart; k < rangeEnd; k++) {
        var area = Math.abs(
          (pointAX - avgX) * ((data[k][1] || 0) - pointAY) -
          (pointAX - data[k][0]) * (avgY - pointAY)
        );
        if (area > maxArea) { maxArea = area; maxIdx = k; }
      }

      sampled[sampledIdx++] = data[maxIdx];
      a = maxIdx;
    }

    sampled[sampledIdx] = data[n - 1];
    return sampled;
  }

  // -- Shared layout fragments ------------------------------------------------

  // Time x-axis. Let Plotly pick its own ticks; SAR-derived timestamps span
  // from minutes to months and Plotly auto-picks far better than we can.
  function timeAxis() {
    var t = themeColors();
    return {
      type: 'date',
      gridcolor: t.grid,
      gridwidth: 0.5,
      linecolor: t.grid,
      tickfont: { color: t.text, size: 10, family: t.font },
      automargin: true
    };
  }

  // Break a long axis title into multiple lines using <br>, which Plotly
  // renders as an actual line break in SVG <text>. Plotly does NOT wrap
  // long titles on its own — they just extend past the chart edge. We
  // split on whitespace and greedily pack words up to ~maxCharsPerLine.
  function wrapAxisTitle(title, maxCharsPerLine) {
    if (!title) return '';
    var limit = maxCharsPerLine || 40;
    if (title.length <= limit) return title;
    var words = String(title).split(/\s+/);
    var lines = [];
    var cur = '';
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (!cur) { cur = w; continue; }
      if ((cur.length + 1 + w.length) <= limit) {
        cur += ' ' + w;
      } else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines.join('<br>');
  }

  // Value y-axis. We deliberately DO NOT set `dtick` — Plotly's automatic
  // tick selection is correct for the value ranges SAR metrics cover.
  // We only apply explicit range bounds when BOTH yMin and yMax are numbers.
  function valueAxis(title, yMin, yMax) {
    var t = themeColors();
    var ax = {
      title: {
        text: wrapAxisTitle(title, 40),
        font: { color: t.text, size: 11, family: t.font },
        standoff: 8
      },
      gridcolor: t.grid,
      gridwidth: 0.5,
      linecolor: t.grid,
      tickfont: { color: t.text, size: 10, family: t.font },
      zeroline: false,
      automargin: true,
      nticks: 8  // soft target; Plotly treats this as a hint, unlike dtick
    };
    if (isNum(yMin) && isNum(yMax)) {
      ax.range = [yMin, yMax];
    } else if (isNum(yMin) && yMin === 0) {
      ax.rangemode = 'tozero';
    }
    return ax;
  }

  // Layout shell. Titles render in the HTML .chart-head above each Plotly host;
  // the plot area only carries axes and data.
  function baseLayout() {
    var t = themeColors();

    return {
      paper_bgcolor: t.paper,
      plot_bgcolor: t.plot,
      height: CHART_HEIGHT,
      margin: { l: 70, r: 20, t: 24, b: 70 },
      dragmode: 'zoom',
      font: { color: t.text, size: 11, family: t.font },
      showlegend: false,
      transition: { duration: 0 },
      hoverlabel: {
        bgcolor: t.hoverBg,
        bordercolor: t.hoverBorder,
        font: { color: t.hoverText, size: 11, family: t.font },
        namelength: -1
      }
    };
  }

  // Chart card headings show the metric name only; units belong on the y-axis.
  function chartHeadTitle(raw) {
    if (!raw) return '';
    var s = String(raw).trim();
    var unitLike = /(?:\/s|%|Mbps|Gbps|KB\/s|MB\/s|tps|byte|kilobyte|usr|nice|sys|iowait|idle|memused|memfree|swpused|runq|plist)/i;

    s = s.replace(/^Percentage of\s+/i, '');
    s = s.replace(/\s+at the user level\b/i, ' (user)');
    s = s.replace(/\s+at the system level\b/i, ' (system)');
    s = s.replace(/\s*\[(?:application|system|idle|iowait|nice|sys|usr|soft|irq|steal|guest|gnice)\]\s*/gi, ' ');

    s = s.replace(/\s*\(([^)]*)\)\s*/g, function (match, inner) {
      return unitLike.test(inner) ? ' ' : match;
    });

    s = s.replace(/\s*\|\s*[^|]*(?:\/s|%|Mbps|Gbps|KB|MB)[^|]*(?:\s*\|\s*[^|]*)*\s*$/gi, '');
    s = s.replace(/^Total number of (?:kilobytes|packets)\s+/i, '');
    return s.replace(/\s+/g, ' ').trim();
  }

  function syncChartHead(containerId, title, accentColor) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var head = el.closest('.chart-card') && el.closest('.chart-card').querySelector('.chart-head');
    if (!head) return;

    var heading = head.querySelector('.chart-heading');
    var subtitle = head.querySelector('.chart-subtitle');
    var color = accentColor || themeColors().accent;
    var hostname = (typeof getHostname === 'function' ? getHostname() || '' : '');
    var headText = chartHeadTitle(title);

    head.style.setProperty('--chart-accent', color);
    head.classList.toggle('is-empty', !headText);

    if (heading) heading.textContent = headText;
    if (subtitle) {
      subtitle.textContent = hostname;
      subtitle.hidden = !hostname;
    }
  }

  function hideChartHead(containerId) {
    var el = document.getElementById(containerId);
    var head = el && el.closest('.chart-card') && el.closest('.chart-card').querySelector('.chart-head');
    if (head) head.classList.add('is-empty');
  }

  // Config deliberately avoids `responsive: true` (the ResizeObserver it
  // installs reflows on every unrelated DOM mutation). We handle resize
  // manually, debounced, at the bottom of this file.
  var BASE_CONFIG = {
    displaylogo: false,
    modeBarButtonsToRemove: [
      'lasso2d', 'select2d', 'autoScale2d',
      'hoverCompareCartesian', 'hoverClosestCartesian',
      'toggleSpikelines'
    ],
    toImageButtonOptions: {
      format: 'png',
      filename: 'sarkart-chart',
      height: 600,
      width: 1400,
      scale: 2
    }
  };

  function prepContainer(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    el.classList.remove('is-heatmap-host');
    el.style.width = '100%';
    el.style.height = CHART_HEIGHT + 'px';
    return el;
  }

  function horizontalPadding(node) {
    if (!node) return 0;
    var cs = getComputedStyle(node);
    return (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  }

  // Plotly freezes SVG width at whatever the container measures during
  // newPlot(). If the surrounding layout has not committed yet, the chart
  // renders narrow and a follow-up resize looks like a left-to-right bounce.
  // Resolve the target width up front and pass it in layout.width instead.
  function resolveChartWidth(el) {
    if (!el) return 0;

    var chartBody = el.closest('.chart-body');
    if (chartBody) {
      void chartBody.offsetWidth;
      var bodyInner = chartBody.clientWidth - horizontalPadding(chartBody);
      if (bodyInner >= 80) return Math.round(bodyInner);
    }

    // Chart blocks start hidden; derive width from the visible section shell
    // and subtract the chart card/body padding we cannot measure yet.
    var section = el.closest('section') || document.querySelector('#content > section');
    if (section) {
      void section.offsetWidth;
      var sectionInner = section.clientWidth - horizontalPadding(section);
      var inset = chartBody ? horizontalPadding(chartBody) : 24;
      var derived = sectionInner - inset;
      if (derived >= 80) return Math.round(derived);
    }

    var content = document.getElementById('content');
    if (content) {
      void content.offsetWidth;
      var contentInner = content.clientWidth;
      if (section) {
        contentInner = Math.min(contentInner, section.clientWidth - horizontalPadding(section));
      }
      contentInner -= chartBody ? horizontalPadding(chartBody) : 24;
      if (contentInner >= 80) return Math.round(contentInner);
    }

    return 0;
  }

  function applyChartDimensions(el, layout) {
    layout.height = CHART_HEIGHT;
    el.style.height = CHART_HEIGHT + 'px';
    el.style.width = '100%';
    el.style.maxWidth = '100%';

    var w = resolveChartWidth(el);
    if (w > 0) {
      var host = el.closest('.chart-body');
      if (host && host.clientWidth >= 80) {
        w = Math.min(w, Math.round(host.clientWidth - horizontalPadding(host)));
      }
      layout.width = w;
      el._sarkartPlotWidth = w;
    }
    return layout;
  }

  // Watch for real container resizes (window, sidebar toggle). Skip the
  // post-newPlot animation-frame resize — that caused the visible bounce.
  function observeChartResize(el) {
    if (!el || typeof window.Plotly === 'undefined') return;
    if (el._sarkartRO || typeof ResizeObserver === 'undefined') return;

    var host = el.closest('.chart-body') || el;
    var timer = null;
    var lastW = el._sarkartPlotWidth || 0;

    el._sarkartRO = new ResizeObserver(function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        if (!el.data || !el.layout) return;
        var w = resolveChartWidth(el);
        if (w < 80 || Math.abs(w - lastW) < 2) return;
        lastW = w;
        el._sarkartPlotWidth = w;
        try {
          window.Plotly.relayout(el, { width: w, height: CHART_HEIGHT });
        } catch (e) {}
      }, 150);
    });
    el._sarkartRO.observe(host);
  }

  // -- printChart (single line) ----------------------------------------------
  function printChartPlotly(containerId, yMin, yMax, yAxisTitle, yTickInterval, color, data) {
    if (!data || !data.length) return;
    if (typeof window.Plotly === 'undefined') return;

    if (data.length > 1 && data[0] && data[0][0] !== undefined) {
      data.sort(function (a, b) { return a[0] - b[0]; });
    }

    var plotData = data.length > MAX_POINTS_PER_SERIES
      ? lttb(data, MAX_POINTS_PER_SERIES)
      : data;

    var el = prepContainer(containerId);
    if (!el) return;

    var xy = splitXY(plotData);
    var seriesColor = color || themeColors().accent;
    var displayTitle = chartHeadTitle(yAxisTitle);

    var trace = {
      type: 'scatter',
      mode: 'lines',
      x: xy.x,
      y: xy.y,
      line: { color: seriesColor, width: 1.3, shape: 'linear', simplify: true },
      name: displayTitle,
      connectgaps: false,
      hovertemplate: '<b>%{y}</b><extra>' + displayTitle + '</extra>'
    };

    var layout = baseLayout();
    layout.xaxis = timeAxis();
    layout.yaxis = valueAxis(yAxisTitle, yMin, yMax);
    // Use unified hover mode (same as multi-chart) so a single-line chart's
    // tooltip matches the multi-line look: one labeled bubble at the x value
    // with the series name and value.
    layout.hovermode = 'x unified';

    syncChartHead(containerId, displayTitle, seriesColor);
    applyChartDimensions(el, layout);
    window.Plotly.newPlot(el, [trace], layout, BASE_CONFIG);
    observeChartResize(el);
  }

  // -- printMultiChart (multi-series line, shared y) -------------------------
  function printMultiChartPlotly(containerId, title, yAxisTitle, yTickInterval, series) {
    if (!series || !series.length) return;
    if (typeof window.Plotly === 'undefined') return;

    var el = prepContainer(containerId);
    if (!el) return;

    // Per-container color offset. Each chart slot (A/B/C/D -> 0/1/2/3) shifts
    // the starting index into MULTI_PALETTE so stacked charts on a multi-chart
    // page don't all look identical. The pill color is pulled from the first
    // trace after it's assigned, guaranteeing pill == line[0] color.
    var slot = /container([A-Z])$/.exec(containerId || '');
    var offset = slot ? (slot[1].charCodeAt(0) - 65) : 0;

    var traces = [];
    var firstLineColor = null;
    for (var s = 0; s < series.length; s++) {
      var d = series[s].data || [];
      if (d.length > 1 && d[0] && d[0][0] !== undefined) {
        d.sort(function (a, b) { return a[0] - b[0]; });
      }
      var plotData = d.length > MAX_POINTS_PER_SERIES ? lttb(d, MAX_POINTS_PER_SERIES) : d;
      var xy = splitXY(plotData);
      var color = MULTI_PALETTE[(offset + s) % MULTI_PALETTE.length];
      if (s === 0) firstLineColor = color;
      traces.push({
        type: 'scatter',
        mode: 'lines',
        x: xy.x,
        y: xy.y,
        line: { color: color, width: 1.3, shape: 'linear', simplify: true },
        name: series[s].name,
        connectgaps: false,
        hovertemplate: '<b>%{y}</b><extra>' + (series[s].name || '') + '</extra>'
      });
    }

    // Header accent comes from the actual first trace color.
    var layout = baseLayout();
    layout.xaxis = timeAxis();
    layout.yaxis = valueAxis(yAxisTitle, 0, null);
    layout.hovermode = 'x unified';
    layout.showlegend = true;
    layout.legend = {
      orientation: 'h',
      x: 0, y: -0.18,
      xanchor: 'left', yanchor: 'top',
      font: { size: 10, color: themeColors().text, family: themeColors().font }
    };
    layout.margin.b = 120;

    syncChartHead(containerId, title, firstLineColor || MULTI_PALETTE[0]);
    applyChartDimensions(el, layout);
    window.Plotly.newPlot(el, traces, layout, BASE_CONFIG);
    observeChartResize(el);
  }

  // -- printPieChart (tiny donut gauge) --------------------------------------
  function printPieChartPlotly(containerId, value, color) {
    if (typeof window.Plotly === 'undefined') return;
    var el = document.getElementById(containerId);
    if (!el) return;

    var v = Math.max(0, Math.min(100, Number(value) || 0));
    var fill = color || themeColors().accent;

    var trace = {
      type: 'pie',
      values: [v, 100 - v],
      marker: {
        colors: [fill, cssVar('--surface-3', 'rgba(255,255,255,0.15)')],
        line: { width: 0 }
      },
      hole: 0.6,
      sort: false,
      direction: 'clockwise',
      rotation: 0,
      textinfo: 'none',
      hoverinfo: 'skip',
      showlegend: false
    };

    var t = themeColors();
    var layout = {
      paper_bgcolor: t.paper,
      plot_bgcolor: t.paper,
      margin: { l: 2, r: 2, t: 2, b: 2 },
      showlegend: false,
      height: 56,
      width: 56,
      transition: { duration: 0 }
    };

    var cfg = { displayModeBar: false, staticPlot: true };

    window.Plotly.newPlot(el, [trace], layout, cfg);
  }

  function axisThemePatch(layout) {
    var t = themeColors();
    var patch = {};
    if (!layout) return patch;

    Object.keys(layout).forEach(function (key) {
      if (key !== 'xaxis' && key !== 'yaxis' && !/^xaxis[2-9]\d*$/.test(key) && !/^yaxis[2-9]\d*$/.test(key)) return;
      var ax = layout[key];
      if (!ax || typeof ax !== 'object') return;
      patch[key + '.gridcolor'] = t.grid;
      patch[key + '.linecolor'] = t.grid;
      patch[key + '.tickfont.color'] = t.text;
      patch[key + '.tickfont.family'] = t.font;
      if (ax.title) {
        patch[key + '.title.font.color'] = t.text;
        patch[key + '.title.font.family'] = t.font;
      }
    });

    return patch;
  }

  function applyThemeToPlot(el) {
    if (!el || !el.data || !el.layout || typeof window.Plotly === 'undefined') return;

    var t = themeColors();

    // KPI mini donut charts
    if (el.layout.width === 56 && el.layout.height === 56) {
      var fill = (el.data[0] && el.data[0].marker && el.data[0].marker.colors && el.data[0].marker.colors[0]) || t.accent;
      try {
        window.Plotly.relayout(el, {
          paper_bgcolor: t.paper,
          plot_bgcolor: t.paper
        });
        window.Plotly.restyle(el, {
          'marker.colors': [[fill, cssVar('--surface-3', 'rgba(255,255,255,0.15)')]]
        });
      } catch (e) {}
      return;
    }

    var patch = Object.assign({
      paper_bgcolor: t.paper,
      plot_bgcolor: t.plot,
      'font.color': t.text,
      'font.family': t.font,
      'hoverlabel.bgcolor': t.hoverBg,
      'hoverlabel.bordercolor': t.hoverBorder,
      'hoverlabel.font.color': t.hoverText,
      'hoverlabel.font.family': t.font
    }, axisThemePatch(el.layout));

    try {
      window.Plotly.relayout(el, patch);
    } catch (e) {}
  }

  function applyThemeToAllPlots() {
    ['containerA', 'containerB', 'containerC', 'containerD', 'peakCPUChart', 'peakLoadChart', 'peakMemoryChart'].forEach(function (id) {
      applyThemeToPlot(document.getElementById(id));
    });
    if (typeof window.sarkartRefreshHeatmaps === 'function') {
      window.sarkartRefreshHeatmaps();
    }
  }

  // -- Install overrides ------------------------------------------------------
  function install() {
    if (typeof window.Plotly === 'undefined') {
      console.warn('[sarkart] Plotly not loaded; chart override skipped');
      return;
    }
    window.printChart      = printChartPlotly;
    window.printMultiChart = printMultiChartPlotly;
    window.printPieChart   = printPieChartPlotly;
    window.sarkartSyncChartHead = syncChartHead;
    window.sarkartHideChartHead = hideChartHead;
    console.log('[sarkart] Plotly chart overrides installed');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }

  window.addEventListener('sarkart-theme-change', applyThemeToAllPlots);

  // Debounced window resize handler for the four main chart containers.
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (typeof window.Plotly === 'undefined') return;
      ['containerA', 'containerB', 'containerC', 'containerD'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el && el.data && el.layout) {
          var w = resolveChartWidth(el);
          if (w < 80) {
            try { window.Plotly.Plots.resize(el); } catch (e) {}
            return;
          }
          try { window.Plotly.relayout(el, { width: w, height: CHART_HEIGHT }); } catch (e) {}
        }
      });
    }, 150);
  });
})();
