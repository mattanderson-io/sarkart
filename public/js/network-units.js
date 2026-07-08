/**
 * SARkart — Network unit selector.
 *
 * SAR reports network throughput as rxkB/s and txkB/s — fine for scripts but
 * not how humans read network performance. NIC datasheets, switch dashboards,
 * and capacity reviews all speak Mbps/Gbps, and a sysadmin asking "is this
 * link saturated?" wants a percentage of link speed, not a raw kilobyte rate.
 *
 * This module:
 *   1. Detects when the currently rendered chart is an Interface Traffic chart
 *      (heuristic: y-axis title or series names mention rxkB/s / txkB/s).
 *   2. Injects a dropdown above the chart card with unit choices:
 *        Auto, KB/s, MB/s, Mbps, Gbps, % of 1/10/25/40/100 Gbps
 *   3. Wraps printMultiChart so all data values are converted before plotly
 *      sees them. The legend/series names and y-axis title are rewritten so
 *      what you see matches what's plotted.
 *   4. Persists the choice in localStorage and re-renders the chart on change.
 *   5. Applies the same conversion to the network panel of the heatmap dash.
 *
 * Why wrap printMultiChart instead of editing call sites: the upstream
 * sarkart-v1.0.0.min.js is minified and we don't own its source. Wrapping
 * the global function keeps the change small and isolated.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'sarkart.netUnit';
  var DEFAULT_UNIT = 'Mbps';

  // Conversion factors from kB/s (SAR's native unit) to each display unit,
  // and the suffix used for axis titles, legends, and tooltips.
  //
  //   1 kB/s = 1024 bytes/s = 8192 bits/s
  //   Mbps   = megabits/sec (decimal: 1e6 bits/s) — matches NIC/switch labeling
  //   Gbps   = gigabits/sec (decimal: 1e9 bits/s)
  //   MB/s   = mebibytes/sec is ambiguous; we use decimal MB (1e6 bytes/s)
  //            because that's how disk and net throughput are typically quoted
  //   '% of N Gbps' = (kB/s * 8192) / (N * 1e9) * 100
  //
  // Auto picks a unit per render based on peak value of the visible series.
  var UNITS = {
    'Auto':           { kind: 'auto',  factor: null,                 suffix: ''      },
    'KB/s':           { kind: 'fixed', factor: 1,                    suffix: 'KB/s'  },
    'MB/s':           { kind: 'fixed', factor: 1024 / 1e6,           suffix: 'MB/s'  },
    'Mbps':           { kind: 'fixed', factor: 8192 / 1e6,           suffix: 'Mbps'  },
    'Gbps':           { kind: 'fixed', factor: 8192 / 1e9,           suffix: 'Gbps'  },
    '% of 1 Gbps':    { kind: 'pct',   factor: 8192 / 1e9 * 100,     suffix: '%',  cap: 1   },
    '% of 10 Gbps':   { kind: 'pct',   factor: 8192 / 10e9 * 100,    suffix: '%',  cap: 10  },
    '% of 25 Gbps':   { kind: 'pct',   factor: 8192 / 25e9 * 100,    suffix: '%',  cap: 25  },
    '% of 40 Gbps':   { kind: 'pct',   factor: 8192 / 40e9 * 100,    suffix: '%',  cap: 40  },
    '% of 100 Gbps':  { kind: 'pct',   factor: 8192 / 100e9 * 100,   suffix: '%',  cap: 100 }
  };

  var ORDER = ['Auto', 'KB/s', 'MB/s', 'Mbps', 'Gbps',
               '% of 1 Gbps', '% of 10 Gbps', '% of 25 Gbps', '% of 40 Gbps', '% of 100 Gbps'];

  // -- Persisted state --------------------------------------------------------
  function getUnit() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      return (v && UNITS[v]) ? v : DEFAULT_UNIT;
    } catch (e) {
      return DEFAULT_UNIT;
    }
  }
  function setUnit(name) {
    if (!UNITS[name]) return;
    try { localStorage.setItem(STORAGE_KEY, name); } catch (e) {}
  }

  // -- Heuristic: is this a network throughput chart? ------------------------
  //
  // The minified upstream emits:
  //   - yAxisTitle "rxkB/s | txkB/s"
  //   - series names that start with "Total number of kilobytes received per
  //     second (rxkB/s)" / "Total number of kilobytes transmitted..."
  // Heatmap path is handled separately.
  function looksLikeNetworkBytesChart(yAxisTitle, series) {
    var hay = (yAxisTitle || '') + '|';
    if (Array.isArray(series)) {
      for (var i = 0; i < series.length; i++) {
        hay += (series[i] && series[i].name) ? series[i].name + '|' : '';
      }
    }
    return /\brx?kB\/?s\b|\btx?kB\/?s\b|\bkilobytes\b/i.test(hay);
  }

  // -- Auto-pick the best fixed unit for a peak value (in kB/s) --------------
  function pickAutoUnit(peakKBs) {
    if (!isFinite(peakKBs) || peakKBs <= 0) return 'Mbps';
    var asMbps = peakKBs * UNITS['Mbps'].factor;
    if (asMbps >= 800)   return 'Gbps';     // nearing 1G+
    if (asMbps >= 1)     return 'Mbps';     // typical server traffic
    if (peakKBs >= 1000) return 'MB/s';     // large in bytes, sub-1 Mbps (rare)
    return 'KB/s';
  }

  // -- Apply unit conversion to a series array (in place is fine; we clone) -
  function convertSeries(seriesIn, factor) {
    var out = [];
    for (var i = 0; i < seriesIn.length; i++) {
      var s = seriesIn[i] || {};
      var dataIn = s.data || [];
      var dataOut = new Array(dataIn.length);
      for (var j = 0; j < dataIn.length; j++) {
        var p = dataIn[j];
        var v = (p && p[1]);
        dataOut[j] = (typeof v === 'number' && isFinite(v))
          ? [p[0], v * factor]
          : [p && p[0], v];
      }
      out.push({
        name: s.name,
        data: dataOut
      });
    }
    return out;
  }

  // Rewrite a series name to swap the SAR unit for the display unit.
  // Example: "...kilobytes received per second (rxkB/s)" -> "...received (Mbps)"
  // Falls back to original name if no recognisable pattern.
  function relabelSeries(name, suffix) {
    if (!name) return name;
    // Replace explicit SAR units with the chosen suffix.
    var renamed = name.replace(/\b(?:rxkB\/s|txkB\/s|kB\/s|kilobytes per second)\b/gi, suffix);
    // Common "Total number of kilobytes ..." prefix is verbose; trim if present.
    renamed = renamed.replace(/^Total number of kilobytes\s+/i, '');
    // De-dup consecutive whitespace introduced by replacements.
    return renamed.replace(/\s+/g, ' ').trim();
  }

  function relabelAxisTitle(title, suffix) {
    if (!title) return title;
    return title.replace(/\b(?:rxkB\/s|txkB\/s|kB\/s)\b/gi, suffix)
                .replace(/\s*\|\s*/g, ' | ')
                .replace(/\s+/g, ' ')
                .trim();
  }

  // -- Track the most recent network printMultiChart call so we can re-render
  //    when the user changes units. ------------------------------------------
  var lastNetCall = null; // { containerId, title, series, yAxisTitle, yTickInterval }

  // -- Wrap window.printMultiChart -------------------------------------------
  function wrapPrintMultiChart() {
    if (typeof window.printMultiChart !== 'function' || window.__sarkartUnitsWrapped) return;
    var orig = window.printMultiChart;

    window.printMultiChart = function (containerId, title, yAxisTitle, yTickInterval, series) {
      if (!looksLikeNetworkBytesChart(yAxisTitle, series)) {
        // Not a network bytes chart — pass through untouched.
        return orig.apply(this, arguments);
      }

      // Cache for re-render on unit change.
      lastNetCall = {
        containerId: containerId,
        title: title,
        yAxisTitle: yAxisTitle,
        yTickInterval: yTickInterval,
        series: series
      };

      renderNetChartWithUnit(orig, lastNetCall, getUnit());
      ensureToolbar(containerId);
    };
    window.__sarkartUnitsWrapped = true;
  }

  function findPeak(series) {
    var peak = 0;
    for (var i = 0; i < series.length; i++) {
      var d = (series[i] && series[i].data) || [];
      for (var j = 0; j < d.length; j++) {
        var v = d[j] && d[j][1];
        if (typeof v === 'number' && isFinite(v) && v > peak) peak = v;
      }
    }
    return peak;
  }

  function renderNetChartWithUnit(origFn, call, unitName) {
    var unit = UNITS[unitName] || UNITS[DEFAULT_UNIT];
    var resolvedName = unitName;
    var factor, suffix;

    if (unit.kind === 'auto') {
      var peakKBs = findPeak(call.series);
      resolvedName = pickAutoUnit(peakKBs);
      var auto = UNITS[resolvedName];
      factor = auto.factor;
      suffix = auto.suffix;
    } else {
      factor = unit.factor;
      suffix = unit.suffix;
    }

    var convertedSeries = convertSeries(call.series, factor);
    for (var i = 0; i < convertedSeries.length; i++) {
      convertedSeries[i].name = relabelSeries(convertedSeries[i].name, suffix);
    }
    var newAxisTitle = relabelAxisTitle(call.yAxisTitle, suffix);

    origFn.call(window, call.containerId, call.title, newAxisTitle, call.yTickInterval, convertedSeries);

    // Update the toolbar's "showing" hint with the resolved unit when Auto.
    var container = document.getElementById(call.containerId);
    var block = container && chartBlock(container);
    var hint = block && block.querySelector('.netUnitsToolbar-hint');
    if (hint) {
      hint.textContent = (unitName === 'Auto')
        ? 'Auto: ' + resolvedName
        : '';
    }
  }

  // -- Toolbar ---------------------------------------------------------------
  //
  // Inserted just above the .card that wraps the active chart container.
  // We attach the toolbar to the parent .contABlock/.contBBlock/etc. so it's
  // hidden when those rows hide. A single global toolbar would also work but
  // would float oddly when only one of containerA/B/C is visible.
  function chartBlock(container) {
    return container.closest('.chart-block') ||
      container.closest('.contABlock, .contBBlock, .contCBlock, .contDBlock');
  }

  function chartShell(container) {
    return container.closest('.chart-card') || container.closest('.card');
  }

  function ensureToolbar(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var shell = chartShell(container);
    var block = chartBlock(container);
    if (!shell || !block) return;

    var existing = block.querySelector('.netUnitsToolbar');
    if (existing) {
      existing.style.display = '';
      var sel = existing.querySelector('select');
      if (sel) sel.value = getUnit();
      return;
    }

    var bar = document.createElement('div');
    bar.className = 'netUnitsToolbar';
    bar.innerHTML =
      '<span class="netUnitsToolbar-label">Display units:</span>' +
      '<select class="netUnitsToolbar-select" aria-label="Network display units">' +
        ORDER.map(function (n) {
          return '<option value="' + n + '"' +
            (n === getUnit() ? ' selected' : '') + '>' + n + '</option>';
        }).join('') +
      '</select>' +
      '<span class="netUnitsToolbar-hint"></span>';

    block.insertBefore(bar, shell);

    bar.querySelector('select').addEventListener('change', function (e) {
      setUnit(e.target.value);
      if (lastNetCall && typeof window.printMultiChart === 'function') {
        // Re-call through the wrapper. It will re-cache (same data) and
        // render with the new unit.
        window.printMultiChart(
          lastNetCall.containerId,
          lastNetCall.title,
          lastNetCall.yAxisTitle,
          lastNetCall.yTickInterval,
          lastNetCall.series
        );
      }
      // Heatmap dashboard re-render if it's open.
      if (typeof window.sarkartRefreshHeatmaps === 'function') {
        window.sarkartRefreshHeatmaps();
      }
    });
  }

  // -- Hide all toolbars when navigating away from a network view ------------
  // We can't perfectly detect "left network view" without hooking the upstream
  // navigation, but we can listen for clicks on any sidebar link that doesn't
  // belong to Interface Traffic. The toolbar will be re-shown by ensureToolbar
  // the next time printMultiChart is called for a network chart.
  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('#sidebar a');
    if (!link) return;
    var inNetTraffic = !!link.closest('#ulInterfaceTraffic');
    var bars = document.querySelectorAll('.netUnitsToolbar');
    for (var i = 0; i < bars.length; i++) {
      bars[i].style.display = inNetTraffic ? '' : 'none';
    }
    if (!inNetTraffic) lastNetCall = null;
  }, true);

  // -- Hide toolbars during PDF capture --------------------------------------
  // export-pdf.js uses html2canvas on each containerA/B/C/D. Hiding the
  // toolbar momentarily during capture keeps it out of the report.
  if (typeof window.html2canvas === 'function') {
    var origH2C = window.html2canvas;
    window.html2canvas = function (el, opts) {
      var bars = document.querySelectorAll('.netUnitsToolbar');
      for (var i = 0; i < bars.length; i++) bars[i].dataset.prevDisplay = bars[i].style.display, bars[i].style.display = 'none';
      var p = origH2C.call(this, el, opts);
      // restore on finally
      var restore = function () {
        for (var j = 0; j < bars.length; j++) bars[j].style.display = bars[j].dataset.prevDisplay || '';
      };
      if (p && typeof p.then === 'function') {
        return p.then(function (r) { restore(); return r; }, function (err) { restore(); throw err; });
      }
      restore();
      return p;
    };
  }

  // -- Install ---------------------------------------------------------------
  function install() {
    wrapPrintMultiChart();
    // Retry once after a tick — plotly-charts.js installs the override on
    // DOMContentLoaded too, and order isn't guaranteed.
    setTimeout(wrapPrintMultiChart, 0);
    setTimeout(wrapPrintMultiChart, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }

  // -- Public hook for heatmap.js to query the conversion --------------------
  // heatmap.js can call this to convert its summed kB/s totals before
  // rendering the network panel.
  window.sarkartNetUnit = {
    get: getUnit,
    convertKBs: function (kbs) {
      var name = getUnit();
      var u = UNITS[name];
      if (!u) return { value: kbs, suffix: 'KB/s' };
      if (u.kind === 'auto') {
        var picked = UNITS[pickAutoUnit(kbs)];
        return { value: kbs * picked.factor, suffix: picked.suffix };
      }
      return { value: kbs * u.factor, suffix: u.suffix };
    },
    // Suffix-only helper for the heatmap colorbar/title.
    suffix: function () {
      var u = UNITS[getUnit()];
      return u && u.kind !== 'auto' ? u.suffix : 'auto';
    }
  };
})();
