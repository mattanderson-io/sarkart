/**
 * SARkart Heatmap Dashboard
 *
 * A secondary dashboard showing a 2×2 grid of heatmaps:
 *   - CPU Utilization (%usr for 'all')
 *   - Memory Utilization (%memused)
 *   - I/O Wait (%iowait from CPU data)
 *   - System Load (runq-sz)
 *
 * Each heatmap is time-of-day (y) × date (x), colored by intensity.
 *
 * Triggered by a "Heatmaps" button in the sidebar.
 */
(function () {
  'use strict';

  // --- Theme helpers ---
  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }

  function hmTheme() {
    return {
      text: cssVar('--chart-axis', '#67728a'),
      plot: cssVar('--chart-plot-bg', '#10151d'),
      grid: cssVar('--chart-grid', '#1d2532'),
      font: cssVar('--font-ui', 'Inter var, sans-serif')
    };
  }

  // Perceptually smoother scales (low → high)
  function scale(stops) {
    return stops;
  }

  var SCALES = {
    cpu: scale([[0, '#10151d'], [0.15, '#1e3a5f'], [0.35, '#2563eb'], [0.55, '#ffa02e'], [0.75, '#f97316'], [1, '#ef4444']]),
    memory: scale([[0, '#10151d'], [0.15, '#14532d'], [0.35, '#22c55e'], [0.55, '#fbbf24'], [0.75, '#f97316'], [1, '#ef4444']]),
    iowait: scale([[0, '#10151d'], [0.2, '#1e3a5f'], [0.4, '#6366f1'], [0.6, '#ffa02e'], [0.8, '#f97316'], [1, '#ef4444']]),
    load: scale([[0, '#10151d'], [0.2, '#134e4a'], [0.4, '#14b8a6'], [0.6, '#fbbf24'], [0.8, '#f97316'], [1, '#ef4444']]),
    swap: scale([[0, '#10151d'], [0.15, '#312e81'], [0.35, '#6366f1'], [0.55, '#ffa02e'], [0.75, '#f97316'], [1, '#ef4444']]),
    network: scale([[0, '#10151d'], [0.2, '#164e63'], [0.4, '#06b6d4'], [0.6, '#22c55e'], [0.8, '#fbbf24'], [1, '#ffa02e']]),
    disk: scale([[0, '#10151d'], [0.2, '#3b0764'], [0.4, '#7c3aed'], [0.6, '#ffa02e'], [0.8, '#f97316'], [1, '#ef4444']])
  };

  // --- Extract heatmap grid from _idx ---
  // Returns { z, x (dates), y (hour labels) } or null
  function extractHeatmap(key, colIndex, filterFn) {
    var lines = (window._idx && window._idx[key]) || [];
    if (!lines.length) return null;

    var grid = {}; // { date: { hour: maxVal } }
    var dates = {};

    for (var i = 0; i < lines.length; i++) {
      var parts = lines[i].split(',');
      if (filterFn && !filterFn(parts)) continue;

      var dateTime = parts[1].split('|');
      var date = dateTime[0];
      var timeStr = dateTime[1];
      if (!date || !timeStr) continue;

      var hour = parseInt(timeStr.split(':')[0], 10);
      if (isNaN(hour)) continue;

      var val = parseFloat(parts[colIndex]);
      if (isNaN(val) || !isFinite(val)) continue;

      if (!grid[date]) grid[date] = {};
      if (!grid[date][hour] || val > grid[date][hour]) {
        grid[date][hour] = val;
      }
      dates[date] = 1;
    }

    var dateList = Object.keys(dates).sort(function (a, b) {
      var ap = a.split('/'), bp = b.split('/');
      var ak = parseInt(ap[2], 10) * 10000 + parseInt(ap[0], 10) * 100 + parseInt(ap[1], 10);
      var bk = parseInt(bp[2], 10) * 10000 + parseInt(bp[0], 10) * 100 + parseInt(bp[1], 10);
      return ak - bk;
    });

    if (!dateList.length) return null;

    var z = [];
    for (var h = 0; h < 24; h++) {
      var row = [];
      for (var d = 0; d < dateList.length; d++) {
        row.push((grid[dateList[d]] && grid[dateList[d]][h]) || 0);
      }
      z.push(row);
    }

    var hourLabels = [];
    for (var hl = 0; hl < 24; hl++) {
      hourLabels.push((hl < 10 ? '0' : '') + hl + ':00');
    }

    return { z: z, x: dateList, y: hourLabels };
  }

  // --- Get data for each metric ---
  function getCPUData() {
    return extractHeatmap('CPU-%usr', 3, function (parts) { return parts[2] === 'all'; });
  }

  function getIOWaitData() {
    // %iowait is typically column index 6 in CPU-%usr lines (after %usr, %nice, %sys, %iowait)
    // Actual position: CPU-%usr header is: CPU,%usr,%nice,%sys,%iowait,%steal,%irq,%soft,%guest,%gnice,%idle
    // parts[0]=key, parts[1]=date|time, parts[2]=CPU-id, parts[3]=%usr, parts[4]=%nice, parts[5]=%sys, parts[6]=%iowait
    return extractHeatmap('CPU-%usr', 6, function (parts) { return parts[2] === 'all'; });
  }

  function getMemoryData() {
    // The memory key is typically "kbmemfree-kbavail" or "kbmemfree-kbmemused"
    // depending on the SAR version. Find whichever exists.
    var memKey = null;
    for (var k in (window._idx || {})) {
      if (k.indexOf('kbmemfree') === 0) { memKey = k; break; }
    }
    if (!memKey) return null;

    // %memused is at column index 5 in the stored line:
    // parts[0]=key, parts[1]=date|time, parts[2]=kbmemfree, parts[3]=kbavail,
    // parts[4]=kbmemused, parts[5]=%memused
    // But we need to verify — find the header and locate %memused
    var headers = window.headers || [];
    var colIdx = 5; // default for RHEL 9 format

    for (var i = 0; i < headers.length; i++) {
      if (headers[i].indexOf('kbmemfree') >= 0) {
        var cols = headers[i].split(',');
        for (var c = 0; c < cols.length; c++) {
          if (cols[c] === '%memused') {
            // Header columns start at parts[2] in the stored line
            // (parts[0]=key, parts[1]=date|time, then header cols)
            colIdx = c + 2;
            break;
          }
        }
        break;
      }
    }

    return extractHeatmap(memKey, colIdx, null);
  }

  function getLoadData() {
    var loadKey = null;
    for (var k in (window._idx || {})) {
      if (k.indexOf('runq-sz') === 0) { loadKey = k; break; }
    }
    if (!loadKey) return null;
    // runq-sz is the first value column (index 2 after key,date|time)
    return extractHeatmap(loadKey, 2, null);
  }

  function getSwapData() {
    var swapKey = null;
    for (var k in (window._idx || {})) {
      if (k.indexOf('kbswpfree') === 0) { swapKey = k; break; }
    }
    if (!swapKey) return null;
    // %swpused is at index 4: key, date|time, kbswpfree, kbswpused, %swpused
    return extractHeatmap(swapKey, 4, null);
  }

  function getNetworkData() {
    // IFACE-rxpck/s lines have interface name at parts[2]
    // rxkB/s at parts[5], txkB/s at parts[6]
    // We sum rx+tx across ALL interfaces for a total throughput heatmap
    var netKey = 'IFACE-rxpck/s';
    var lines = (window._idx && window._idx[netKey]) || [];
    if (!lines.length) return null;

    var grid = {}; // { date: { hour: totalKBs } }
    var dates = {};

    for (var i = 0; i < lines.length; i++) {
      var parts = lines[i].split(',');
      var dateTime = parts[1].split('|');
      var date = dateTime[0];
      var timeStr = dateTime[1];
      if (!date || !timeStr) continue;

      var hour = parseInt(timeStr.split(':')[0], 10);
      if (isNaN(hour)) continue;

      var rxKB = parseFloat(parts[5]) || 0;
      var txKB = parseFloat(parts[6]) || 0;
      var total = rxKB + txKB;

      if (!grid[date]) grid[date] = {};
      // Sum across all interfaces for this hour
      grid[date][hour] = (grid[date][hour] || 0) + total;
      dates[date] = 1;
    }

    var dateList = Object.keys(dates).sort(function (a, b) {
      var ap = a.split('/'), bp = b.split('/');
      return (parseInt(ap[2],10)*10000+parseInt(ap[0],10)*100+parseInt(ap[1],10)) -
             (parseInt(bp[2],10)*10000+parseInt(bp[0],10)*100+parseInt(bp[1],10));
    });

    if (!dateList.length) return null;

    // Apply unit conversion if the user has chosen a non-default unit. The
    // network-units module exposes a helper that takes kB/s and returns
    // { value, suffix }. We pick the suffix based on the grid peak so all
    // cells share the same scale even in Auto mode.
    var unitSuffix = ' KB/s';
    var unitFactor = 1;
    if (window.sarkartNetUnit) {
      // Find peak across the grid to feed Auto picker.
      var peak = 0;
      for (var dk in grid) {
        if (!grid.hasOwnProperty(dk)) continue;
        for (var hk in grid[dk]) {
          if (grid[dk].hasOwnProperty(hk) && grid[dk][hk] > peak) peak = grid[dk][hk];
        }
      }
      var conv = window.sarkartNetUnit.convertKBs(peak);
      // conv.value is the converted peak; factor is value/peak (guard /0).
      unitFactor = peak > 0 ? (conv.value / peak) : 1;
      unitSuffix = ' ' + conv.suffix;
    }

    var z = [];
    for (var h = 0; h < 24; h++) {
      var row = [];
      for (var d = 0; d < dateList.length; d++) {
        var v = (grid[dateList[d]] && grid[dateList[d]][h]) || 0;
        row.push(v * unitFactor);
      }
      z.push(row);
    }

    var hourLabels = [];
    for (var hl = 0; hl < 24; hl++) hourLabels.push((hl < 10 ? '0' : '') + hl + ':00');

    return { z: z, x: dateList, y: hourLabels, unitLabel: unitSuffix };
  }

  function getDiskData() {
    // DEV-tps lines have device name at parts[2], tps at parts[3]
    // Sum tps across ALL devices for total I/O throughput
    var devKey = 'DEV-tps';
    var lines = (window._idx && window._idx[devKey]) || [];
    if (!lines.length) return null;

    var grid = {};
    var dates = {};

    for (var i = 0; i < lines.length; i++) {
      var parts = lines[i].split(',');
      var dateTime = parts[1].split('|');
      var date = dateTime[0];
      var timeStr = dateTime[1];
      if (!date || !timeStr) continue;

      var hour = parseInt(timeStr.split(':')[0], 10);
      if (isNaN(hour)) continue;

      var tps = parseFloat(parts[3]) || 0;

      if (!grid[date]) grid[date] = {};
      grid[date][hour] = (grid[date][hour] || 0) + tps;
      dates[date] = 1;
    }

    var dateList = Object.keys(dates).sort(function (a, b) {
      var ap = a.split('/'), bp = b.split('/');
      return (parseInt(ap[2],10)*10000+parseInt(ap[0],10)*100+parseInt(ap[1],10)) -
             (parseInt(bp[2],10)*10000+parseInt(bp[0],10)*100+parseInt(bp[1],10));
    });

    if (!dateList.length) return null;

    var z = [];
    for (var h = 0; h < 24; h++) {
      var row = [];
      for (var d = 0; d < dateList.length; d++) {
        row.push((grid[dateList[d]] && grid[dateList[d]][h]) || 0);
      }
      z.push(row);
    }

    var hourLabels = [];
    for (var hl = 0; hl < 24; hl++) hourLabels.push((hl < 10 ? '0' : '') + hl + ':00');

    return { z: z, x: dateList, y: hourLabels };
  }

  // --- Render a single heatmap into a container ---
  function resetContainerForHeatmaps(el) {
    if (!el) return;
    if (window.Plotly && el.data) {
      try { window.Plotly.purge(el); } catch (e) {}
    }
    if (el._sarkartRO) {
      try { el._sarkartRO.disconnect(); } catch (e) {}
      el._sarkartRO = null;
    }
    el._sarkartPlotWidth = 0;
    el.style.height = '';
    el.style.width = '';
    el.style.minWidth = '';
    el.classList.add('is-heatmap-host');
  }

  function renderSingleHeatmap(el, data, title, colorscale, zmax, unit) {
    if (!data || !el) return;
    var th = hmTheme();

    var trace = {
      type: 'heatmap',
      z: data.z,
      x: data.x,
      y: data.y,
      colorscale: colorscale,
      zmin: 0,
      zmax: zmax || undefined,
      colorbar: {
        title: { text: unit || '%', font: { color: th.text, size: 10, family: th.font } },
        tickfont: { color: th.text, size: 9, family: th.font },
        thickness: 12,
        len: 0.85
      },
      hovertemplate: '<b>%{x}</b> at %{y}<br>' + title + ': %{z:.1f}' + (unit || '%') + '<extra></extra>',
      xgap: 2,
      ygap: 2
    };

    var layout = {
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: th.plot,
      margin: { l: 50, r: 60, t: 36, b: 50 },
      height: 280,
      font: { family: th.font, color: th.text },
      title: {
        text: '<b>' + title + '</b>',
        font: { color: th.text, size: 12, family: th.font },
        x: 0.5, xanchor: 'center', y: 0.98, yanchor: 'top'
      },
      xaxis: {
        tickfont: { color: th.text, size: 8, family: th.font },
        tickangle: -45,
        gridcolor: th.grid,
        fixedrange: true
      },
      yaxis: {
        tickfont: { color: th.text, size: 8, family: th.font },
        autorange: 'reversed',
        gridcolor: th.grid,
        fixedrange: true
      }
    };

    var config = { displaylogo: false, displayModeBar: false, staticPlot: false, scrollZoom: false };

    window.Plotly.newPlot(el, [trace], layout, config);
  }

  // --- Render the heatmap dashboard ---
  function renderHeatmapDashboard() {
    if (typeof window.Plotly === 'undefined') return;
    if (typeof chartPage === 'function') chartPage();

    var titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = 'Heatmap Dashboard';

    var containerA = document.getElementById('containerA');
    if (!containerA) return;

    resetContainerForHeatmaps(containerA);

    if (typeof window.sarkartHideChartHead === 'function') window.sarkartHideChartHead('containerA');

    containerA.innerHTML =
      '<div class="heatmap-grid">' +
        '<div class="heatmap-cell" id="hm-cpu"></div>' +
        '<div class="heatmap-cell" id="hm-mem"></div>' +
        '<div class="heatmap-cell" id="hm-iowait"></div>' +
        '<div class="heatmap-cell" id="hm-load"></div>' +
        '<div class="heatmap-cell" id="hm-swap"></div>' +
        '<div class="heatmap-cell" id="hm-network"></div>' +
        '<div class="heatmap-cell" id="hm-disk"></div>' +
      '</div>';

    if (typeof showBlock === 'function') showBlock('A');
    ['B', 'C', 'D'].forEach(function (id) { if (typeof hideBlock === 'function') hideBlock(id); });

    var cpuData = getCPUData();
    var memData = getMemoryData();
    var iowaitData = getIOWaitData();
    var loadData = getLoadData();
    var swapData = getSwapData();
    var networkData = getNetworkData();
    var diskData = getDiskData();

    setTimeout(function () {
      renderSingleHeatmap(document.getElementById('hm-cpu'), cpuData, 'CPU Utilization', SCALES.cpu, 100, '%');
      renderSingleHeatmap(document.getElementById('hm-mem'), memData, 'Memory Utilization', SCALES.memory, 100, '%');
      renderSingleHeatmap(document.getElementById('hm-iowait'), iowaitData, 'I/O Wait', SCALES.iowait, null, '%');
      renderSingleHeatmap(document.getElementById('hm-load'), loadData, 'Run Queue (Load)', SCALES.load, null, '');
      renderSingleHeatmap(document.getElementById('hm-swap'), swapData, 'Swap Usage', SCALES.swap, null, '%');
      var netUnit = (networkData && networkData.unitLabel) || ' KB/s';
      renderSingleHeatmap(document.getElementById('hm-network'), networkData, 'Network Traffic (rx+tx)', SCALES.network, null, netUnit);
      renderSingleHeatmap(document.getElementById('hm-disk'), diskData, 'Disk Transfers', SCALES.disk, null, ' tps');
    }, 50);
  }

  // --- Add "Heatmaps" button to sidebar ---
  function addHeatmapButton() {
    var sidebar = document.querySelector('#sidebar ul.sidebar-nav');
    if (!sidebar || document.getElementById('btnHeatmap')) return;

    // Insert after Dashboard
    var dashItem = document.getElementById('btnSAR');
    var insertAfter = dashItem ? dashItem.closest('li') : sidebar.querySelector('li');

    var li = document.createElement('li');
    li.className = 'nav-item-primary nav-sec-primary nav-item-heatmaps';
    li.innerHTML = '<a href="#" id="btnHeatmap"><svg class="icon" aria-hidden="true"><use href="#i-flame"/></svg>Heatmaps</a>';

    if (insertAfter && insertAfter.nextSibling) {
      sidebar.insertBefore(li, insertAfter.nextSibling);
    } else {
      sidebar.appendChild(li);
    }

    var link = li.querySelector('a');
    link.classList.add('show');
    link.style.visibility = 'visible';

    link.addEventListener('click', function (e) {
      e.preventDefault();
      renderHeatmapDashboard();
    });
  }

  // --- Wait for data ---
  function waitForData() {
    var el = document.getElementById('peakCPU');
    if (!el) return setTimeout(waitForData, 500);

    var observer = new MutationObserver(function () {
      var val = (el.textContent || '').trim();
      if (val && /\d/.test(val)) {
        observer.disconnect();
        setTimeout(addHeatmapButton, 300);
      }
    });
    observer.observe(el, { childList: true, characterData: true, subtree: true });

    var val = (el.textContent || '').trim();
    if (val && /\d/.test(val)) {
      observer.disconnect();
      setTimeout(addHeatmapButton, 300);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForData);
  } else {
    waitForData();
  }

  // Hook for network-units.js: re-render the heatmap dashboard when the
  // user changes display units. No-op unless the dashboard is currently up
  // (we detect that by the presence of the heatmap grid in containerA).
  window.sarkartRefreshHeatmaps = function () {
    var grid = document.querySelector('#containerA .heatmap-grid');
    if (grid) renderHeatmapDashboard();
  };
})();


// --- Cleanup: remove heatmap grid when navigating away ----------------------
(function () {
  function resetHeatmapHost(containerA) {
    if (!containerA) return;
    if (window.Plotly && containerA.data) {
      try { window.Plotly.purge(containerA); } catch (ex) {}
    }
    if (containerA._sarkartRO) {
      try { containerA._sarkartRO.disconnect(); } catch (ex) {}
      containerA._sarkartRO = null;
    }
    containerA._sarkartPlotWidth = 0;
    containerA.classList.remove('is-heatmap-host');
    containerA.style.height = '';
    containerA.style.width = '';
    containerA.style.minWidth = '';
    containerA.innerHTML = '';
  }

  // Capture phase: run before the legacy engine clears containerA on
  // Dashboard clicks, otherwise .heatmap-grid is already gone and the
  // is-heatmap-host class sticks (breaking line-chart height).
  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('#sidebar ul a');
    if (!link) return;
    if (link.id === 'btnHeatmap') return;
    // Don't clear when clicking a dropdown toggle (CPU, Memory, Processes,
    // Devices, etc.) — those just expand/collapse sub-menus without
    // navigating to a chart view.
    if (link.hasAttribute('data-bs-toggle')) return;

    var containerA = document.getElementById('containerA');
    var grid = document.querySelector('.heatmap-grid');
    if (!grid && !(containerA && containerA.classList.contains('is-heatmap-host'))) return;

    if (grid) grid.remove();
    resetHeatmapHost(containerA);

    var titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = '';
  }, true);
})();
