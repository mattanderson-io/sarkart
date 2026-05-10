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

  // -- Theme ------------------------------------------------------------------
  var ORANGE     = '#FF9900';
  var INK        = '#232F3E';
  var PAPER_BG   = 'rgba(0,0,0,0)';
  var PLOT_BG    = '#ffffff';
  var GRID_COLOR = '#e5e5e5';
  var TEXT_COLOR = '#232F3E';

  var MULTI_PALETTE = [
    '#FF9900', '#1B9AAA', '#232F3E', '#55BF3B',
    '#DF5353', '#527bad', '#8d4654', '#cc6699'
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
    return {
      type: 'date',
      gridcolor: GRID_COLOR,
      gridwidth: 0.5,
      linecolor: '#cccccc',
      tickfont: { color: TEXT_COLOR, size: 10 },
      automargin: true
    };
  }

  // Value y-axis. We deliberately DO NOT set `dtick` — Plotly's automatic
  // tick selection is correct for the value ranges SAR metrics cover.
  // We only apply explicit range bounds when BOTH yMin and yMax are numbers.
  function valueAxis(title, yMin, yMax) {
    var ax = {
      title: { text: title, font: { color: TEXT_COLOR, size: 11 } },
      gridcolor: GRID_COLOR,
      gridwidth: 0.5,
      linecolor: '#cccccc',
      tickfont: { color: TEXT_COLOR, size: 10 },
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

  // Layout shell. The title is a plain Plotly title (supports HTML <b>).
  // Hostname subtitle goes into the top-right as a paper-referenced annotation.
  function baseLayout(title, subtitleColor) {
    var layout = {
      paper_bgcolor: PAPER_BG,
      plot_bgcolor: PLOT_BG,
      height: CHART_HEIGHT,
      margin: { l: 70, r: 20, t: 40, b: 50 },
      dragmode: 'zoom',
      font: { color: TEXT_COLOR, size: 11 },
      showlegend: false,
      transition: { duration: 0 }   // disable animated transitions
    };
    if (title) {
      layout.title = {
        text: '<b>' + title + '</b>',
        font: { color: TEXT_COLOR, size: 13 },
        x: 0.02,
        xanchor: 'left',
        y: 0.97,
        yanchor: 'top'
      };
    }
    var hostname = (typeof getHostname === 'function' ? getHostname() || '' : '');
    if (hostname) {
      layout.annotations = [{
        text: hostname,
        xref: 'paper', yref: 'paper',
        x: 1, y: 1.02,
        xanchor: 'right', yanchor: 'bottom',
        showarrow: false,
        font: { color: subtitleColor || ORANGE, size: 10, weight: 700 }
      }];
    }
    return layout;
  }

  // Config deliberately avoids `responsive: true` (the ResizeObserver it
  // installs reflows on every unrelated DOM mutation). We handle resize
  // manually, debounced, at the bottom of this file.
  var BASE_CONFIG = {
    displaylogo: false,
    modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d', 'hoverCompareCartesian'],
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
    el.style.height = CHART_HEIGHT + 'px';
    return el;
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
    var seriesColor = color || ORANGE;
    var displayTitle = (yAxisTitle || '').split('(')[0].trim();

    var trace = {
      type: 'scatter',
      mode: 'lines',
      x: xy.x,
      y: xy.y,
      line: { color: seriesColor, width: 1.3, shape: 'linear', simplify: true },
      name: displayTitle,
      connectgaps: false,
      hovertemplate: '%{x|%Y-%m-%d %H:%M}<br><b>%{y}</b><extra></extra>'
    };

    var layout = baseLayout(displayTitle, seriesColor);
    layout.xaxis = timeAxis();
    layout.yaxis = valueAxis(yAxisTitle, yMin, yMax);
    layout.hovermode = 'x';  // single line — per-point hover is faster than 'x unified'

    window.Plotly.newPlot(el, [trace], layout, BASE_CONFIG);
  }

  // -- printMultiChart (multi-series line, shared y) -------------------------
  function printMultiChartPlotly(containerId, title, yAxisTitle, yTickInterval, series) {
    if (!series || !series.length) return;
    if (typeof window.Plotly === 'undefined') return;

    var el = prepContainer(containerId);
    if (!el) return;

    var traces = [];
    for (var s = 0; s < series.length; s++) {
      var d = series[s].data || [];
      if (d.length > 1 && d[0] && d[0][0] !== undefined) {
        d.sort(function (a, b) { return a[0] - b[0]; });
      }
      var plotData = d.length > MAX_POINTS_PER_SERIES ? lttb(d, MAX_POINTS_PER_SERIES) : d;
      var xy = splitXY(plotData);
      var color = MULTI_PALETTE[s % MULTI_PALETTE.length];
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

    var titleColor = MULTI_PALETTE[0];
    var layout = baseLayout(title, titleColor);
    layout.xaxis = timeAxis();
    layout.yaxis = valueAxis(yAxisTitle, 0, null);
    layout.hovermode = 'x unified';
    layout.showlegend = true;
    layout.legend = {
      orientation: 'h',
      x: 0, y: -0.22,
      xanchor: 'left', yanchor: 'top',
      font: { size: 10, color: TEXT_COLOR }
    };
    layout.margin.b = 90;

    window.Plotly.newPlot(el, traces, layout, BASE_CONFIG);
  }

  // -- printPieChart (tiny donut gauge) --------------------------------------
  function printPieChartPlotly(containerId, value, color) {
    if (typeof window.Plotly === 'undefined') return;
    var el = document.getElementById(containerId);
    if (!el) return;

    var v = Math.max(0, Math.min(100, Number(value) || 0));
    var fill = color || ORANGE;

    var trace = {
      type: 'pie',
      values: [v, 100 - v],
      marker: {
        colors: [fill, 'rgba(255,255,255,0.15)'],
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

    var layout = {
      paper_bgcolor: PAPER_BG,
      plot_bgcolor: PAPER_BG,
      margin: { l: 0, r: 0, t: 0, b: 0 },
      showlegend: false,
      height: 100,
      width: 100,
      transition: { duration: 0 }
    };

    var cfg = { displayModeBar: false, staticPlot: true };

    window.Plotly.newPlot(el, [trace], layout, cfg);
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
    console.log('[sarkart] Plotly chart overrides installed');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }

  // Debounced window resize handler for the four main chart containers.
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (typeof window.Plotly === 'undefined') return;
      ['containerA', 'containerB', 'containerC', 'containerD'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el && el.data && el.layout) {
          try { window.Plotly.Plots.resize(el); } catch (e) {}
        }
      });
    }, 150);
  });
})();
