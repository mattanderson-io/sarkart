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
 * Click any heatmap to expand it full-size in containerA.
 *
 * Triggered by a "Heatmaps" button in the sidebar.
 */
(function () {
  'use strict';

  // --- Color scales per metric ---
  var SCALES = {
    cpu: [
      [0, '#ffffff'], [0.2, '#e3f2fd'], [0.4, '#1B9AAA'],
      [0.6, '#FF9900'], [0.8, '#DF5353'], [1.0, '#ff1744']
    ],
    memory: [
      [0, '#ffffff'], [0.2, '#e8f5e9'], [0.4, '#17c671'],
      [0.6, '#FFAC31'], [0.8, '#DF5353'], [1.0, '#ff1744']
    ],
    iowait: [
      [0, '#ffffff'], [0.15, '#e3f2fd'], [0.3, '#527bad'],
      [0.5, '#FF9900'], [0.75, '#DF5353'], [1.0, '#ff1744']
    ],
    load: [
      [0, '#ffffff'], [0.2, '#e0f7fa'], [0.4, '#42E2B8'],
      [0.6, '#FFAC31'], [0.8, '#DF5353'], [1.0, '#ff1744']
    ],
    swap: [
      [0, '#ffffff'], [0.1, '#e3f2fd'], [0.25, '#527bad'],
      [0.5, '#FF9900'], [0.75, '#DF5353'], [1.0, '#ff1744']
    ],
    network: [
      [0, '#ffffff'], [0.2, '#e0f7fa'], [0.4, '#1B9AAA'],
      [0.6, '#17c671'], [0.8, '#FFAC31'], [1.0, '#FF9900']
    ],
    disk: [
      [0, '#ffffff'], [0.2, '#ede7f6'], [0.4, '#6A55C2'],
      [0.6, '#FF9900'], [0.8, '#DF5353'], [1.0, '#ff1744']
    ]
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
  function renderSingleHeatmap(el, data, title, colorscale, zmax, unit) {
    if (!data || !el) return;

    var trace = {
      type: 'heatmap',
      z: data.z,
      x: data.x,
      y: data.y,
      colorscale: colorscale,
      zmin: 0,
      zmax: zmax || undefined,
      colorbar: {
        title: { text: unit || '%', font: { color: '#232F3E', size: 10 } },
        tickfont: { color: '#232F3E', size: 9 },
        thickness: 12,
        len: 0.85
      },
      hovertemplate: '<b>%{x}</b> at %{y}<br>' + title + ': %{z:.1f}' + (unit || '%') + '<extra></extra>',
      xgap: 1,
      ygap: 1
    };

    var layout = {
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: '#d0d0d0',
      margin: { l: 50, r: 60, t: 36, b: 50 },
      height: 280,
      title: {
        text: '<b>' + title + '</b>',
        font: { color: '#232F3E', size: 12 },
        x: 0.5, xanchor: 'center', y: 0.98, yanchor: 'top'
      },
      xaxis: {
        tickfont: { color: '#232F3E', size: 8 },
        tickangle: -45,
        gridcolor: '#eee'
      },
      yaxis: {
        tickfont: { color: '#232F3E', size: 8 },
        autorange: 'reversed',
        gridcolor: '#eee'
      }
    };

    var config = { displaylogo: false, displayModeBar: false, staticPlot: false };

    window.Plotly.newPlot(el, [trace], layout, config);
  }

  // --- Render full-size expanded heatmap ---
  function renderExpanded(data, title, colorscale, zmax, unit) {
    if (typeof chartPage === 'function') chartPage();

    var el = document.getElementById('containerA');
    if (!el) return;

    var titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = title + ' Heatmap';

    var trace = {
      type: 'heatmap',
      z: data.z,
      x: data.x,
      y: data.y,
      colorscale: colorscale,
      zmin: 0,
      zmax: zmax || undefined,
      colorbar: {
        title: { text: unit || '%', font: { color: '#232F3E', size: 11 } },
        tickfont: { color: '#232F3E', size: 10 },
        thickness: 15,
        len: 0.8
      },
      hovertemplate: '<b>%{x}</b> at %{y}<br>' + title + ': %{z:.1f}' + (unit || '%') + '<extra></extra>',
      xgap: 1,
      ygap: 1
    };

    var layout = {
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: '#d0d0d0',
      margin: { l: 60, r: 80, t: 50, b: 70 },
      height: 500,
      title: {
        text: '<b>' + title + ' Heatmap</b>',
        font: { color: '#232F3E', size: 14 },
        x: 0.5, xanchor: 'center'
      },
      xaxis: {
        title: { text: 'Date', font: { color: '#232F3E', size: 11 } },
        tickfont: { color: '#232F3E', size: 9 },
        tickangle: -45
      },
      yaxis: {
        title: { text: 'Hour of Day', font: { color: '#232F3E', size: 11 } },
        tickfont: { color: '#232F3E', size: 9 },
        autorange: 'reversed'
      }
    };

    var config = {
      displaylogo: false,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
      toImageButtonOptions: { format: 'png', filename: 'sarkart-heatmap-' + title.toLowerCase().replace(/\s+/g, '-'), height: 700, width: 1400, scale: 2 }
    };

    window.Plotly.newPlot(el, [trace], layout, config);
    ['B', 'C', 'D'].forEach(function (id) { if (typeof hideBlock === 'function') hideBlock(id); });
  }

  // --- Render the heatmap dashboard ---
  function renderHeatmapDashboard() {
    if (typeof window.Plotly === 'undefined') return;
    if (typeof chartPage === 'function') chartPage();

    var titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = 'Heatmap Dashboard';

    var containerA = document.getElementById('containerA');
    if (!containerA) return;

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

      var cells = [
        { el: 'hm-cpu', data: cpuData, title: 'CPU Utilization', scale: SCALES.cpu, zmax: 100, unit: '%' },
        { el: 'hm-mem', data: memData, title: 'Memory Utilization', scale: SCALES.memory, zmax: 100, unit: '%' },
        { el: 'hm-iowait', data: iowaitData, title: 'I/O Wait', scale: SCALES.iowait, zmax: null, unit: '%' },
        { el: 'hm-load', data: loadData, title: 'Run Queue (Load)', scale: SCALES.load, zmax: null, unit: '' },
        { el: 'hm-swap', data: swapData, title: 'Swap Usage', scale: SCALES.swap, zmax: null, unit: '%' },
        { el: 'hm-network', data: networkData, title: 'Network Traffic (rx+tx)', scale: SCALES.network, zmax: null, unit: netUnit },
        { el: 'hm-disk', data: diskData, title: 'Disk Transfers', scale: SCALES.disk, zmax: null, unit: ' tps' }
      ];

      cells.forEach(function (c) {
        var cellEl = document.getElementById(c.el);
        if (cellEl && c.data) {
          cellEl.style.cursor = 'pointer';
          cellEl.title = 'Click to expand';
          cellEl.addEventListener('click', function () {
            renderExpanded(c.data, c.title, c.scale, c.zmax, c.unit);
          });
        }
      });
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
    li.innerHTML = '<a href="#" id="btnHeatmap" class="hide1"><i class="fas fa-fire fa-fw" style="color: #ff5722" aria-hidden="true"></i>Heatmaps</a>';

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
  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('#sidebar ul a');
    if (!link) return;
    if (link.id === 'btnHeatmap') return;
    // Don't clear when clicking a dropdown toggle (CPU, Memory, Processes,
    // Devices, etc.) — those just expand/collapse sub-menus without
    // navigating to a chart view.
    if (link.hasAttribute('data-bs-toggle')) return;
    var grid = document.querySelector('.heatmap-grid');
    if (grid) {
      grid.remove();
      // Reset containerA so the next chart renders into a clean element
      var containerA = document.getElementById('containerA');
      if (containerA) {
        if (window.Plotly && containerA.data) {
          try { window.Plotly.purge(containerA); } catch (ex) {}
        }
        containerA.innerHTML = '';
      }
      var titleEl = document.getElementById('pageTitle');
      if (titleEl) titleEl.textContent = '';
    }
  });
})();
