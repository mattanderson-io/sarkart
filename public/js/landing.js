/**
 * Landing-page UX helpers for sarkart-plotly.
 *
 * Responsibilities:
 *   1. Mark <body class="data-loaded"> once a SAR file has been parsed, so
 *      CSS can show the file-info bar.
 *   2. Populate the file-info bar (host / OS / dates / file name).
 *   3. Wire the "Open another file" toolbar button to the existing upload
 *      input without triggering a full page reload (that's what Reset does).
 *
 * Load order: this script must come AFTER sarkart-v1.0.0.min.js and
 * sar-chunked-parser.js so the app's helpers are defined.
 */
(function () {
  'use strict';

  // ---------- Process Data click isolation ----------
  // The "Process Data" button lives inside the dropzone, which has a
  // click listener that re-opens the file picker. Attach a bubble-phase
  // listener directly on the button that stops propagation — the button's
  // own jQuery handler fires first (starting processing), then this
  // listener stops the click from bubbling up to the dropzone.
  function wireProcessDataStopPropagation() {
    var btn = document.getElementById('btnProcessData');
    if (!btn || btn.__sarkartStopWired) return;
    btn.addEventListener('click', function (e) { e.stopPropagation(); });
    btn.__sarkartStopWired = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireProcessDataStopPropagation);
  } else {
    wireProcessDataStopPropagation();
  }

  // ---------- Open another file ----------
  // Simpler than a full reset: hide the dashboard and re-show the upload
  // widget. The parsed data in _idx / _fullIdx stays in memory, so the user
  // can flip back by clicking Dashboard. Clicking Reset still does a hard
  // reload.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('#btnOpenAnother');
    if (!btn) return;
    e.preventDefault();
    document.body.classList.remove('data-loaded');
    // Re-show the upload card + hide dashboard content.
    if (typeof homePage === 'function') homePage();
    // Scroll to the upload block.
    var up = document.querySelector('.sar-file-uploader');
    if (up) up.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ---------- Toggle body.data-loaded when SAR data becomes available ----------
  // The app signals "dashboard ready" by populating #peakCPU. We watch that
  // element and set body.data-loaded the first time it gets a numeric value.
  function markLoaded() {
    document.body.classList.add('data-loaded');
    populateFileInfo();
    document.getElementById('btnOpenAnother') && (document.getElementById('btnOpenAnother').style.display = '');
  }

  // Also watch the progress / spinner block: once the spinner is hidden and
  // peakCPU has a value, we're done.
  function maybeMark() {
    var el = document.getElementById('peakCPU');
    if (!el) return;
    var txt = (el.textContent || '').trim();
    if (txt && /\d/.test(txt)) markLoaded();
  }

  var peakObserver = new MutationObserver(function () { maybeMark(); });
  var startObserver = function () {
    var el = document.getElementById('peakCPU');
    if (!el) return setTimeout(startObserver, 200);
    peakObserver.observe(el, { childList: true, subtree: true, characterData: true });
    maybeMark();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }

  // ---------- Populate the file-info bar ----------
  function populateFileInfo() {
    var host = '', os = '', dates = '—', fileName = '—';
    try { if (typeof getHostname === 'function') host = getHostname() || ''; } catch (e) {}
    try { if (typeof getOS === 'function')       os   = getOS() || ''; } catch (e) {}

    // Date range: read the existing dateFilterInfo if populated, otherwise
    // fall back to the first / last parsed date.
    var info = document.getElementById('dateFilterInfo');
    if (info && info.textContent && /\d/.test(info.textContent)) {
      dates = info.textContent.trim();
    } else if (Array.isArray(window._allDatesArr) && window._allDatesArr.length) {
      var a = window._allDatesArr;
      dates = a.length === 1 ? a[0] : (a[0] + ' – ' + a[a.length - 1] + ' (' + a.length + ' days)');
    }

    // File name: read the filename we displayed during upload.
    var fn = document.querySelector('.fileinput-filename');
    if (fn && fn.textContent) fileName = fn.textContent.trim() || '—';

    var setText = function (id, val) {
      var el = document.getElementById(id);
      if (!el) return;
      el.textContent = val || '—';
      if (id === 'fileInfoName') el.title = val || '';
    };
    setText('fileInfoHost',  host);
    setText('fileInfoOS',    os);
    setText('fileInfoDates', dates);
    setText('fileInfoName',  fileName);
  }
})();


// ---------- Strip "<title> for <hostname>" suffix from page titles ---------
// The hostname is already visible in the file-info bar at the top of the
// page, so appending it to every chart-view title is redundant and eats
// horizontal space. The upstream sarkart-v1.0.0.min.js builds these titles
// in two places: a shared displayTitle() helper and one inline per-device
// title. We cover both by (a) wrapping displayTitle when it becomes
// available, and (b) observing #pageTitle so anything else that writes to
// it also gets the suffix stripped.
(function () {
  function stripHost(s) {
    if (typeof s !== 'string') return s;
    var host = '';
    try { if (typeof getHostname === 'function') host = (getHostname() || '').trim(); } catch (e) {}
    if (!host) return s;
    // Match trailing " for <host>" (case-insensitive on the literal "for").
    // Host may contain regex-special characters, so escape.
    var escaped = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return s.replace(new RegExp('\\s+for\\s+' + escaped + '\\s*$', 'i'), '');
  }

  function wrapDisplayTitle() {
    if (typeof window.displayTitle !== 'function' || window.__displayTitleWrapped) return;
    var orig = window.displayTitle;
    window.displayTitle = function (title) {
      // Call through, then fix up #pageTitle after the fact. (displayTitle
      // does more than set the title — it also calls chartPage() etc.)
      var r = orig.apply(this, arguments);
      var el = document.getElementById('pageTitle');
      if (el) el.textContent = stripHost(el.textContent || '');
      return r;
    };
    window.__displayTitleWrapped = true;
  }

  function wireObserver() {
    var el = document.getElementById('pageTitle');
    if (!el) return;
    var mo = new MutationObserver(function () {
      var cur = el.textContent || '';
      var fixed = stripHost(cur);
      if (fixed !== cur) el.textContent = fixed;
    });
    mo.observe(el, { childList: true, characterData: true, subtree: true });
  }

  function start() {
    wrapDisplayTitle();
    wireObserver();
    // displayTitle is defined inside sarkart-v1.0.0.min.js which loads before
    // us, so it should already be there. But belt-and-braces: retry once in
    // case load order ever slips.
    if (!window.__displayTitleWrapped) setTimeout(wrapDisplayTitle, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();


// ---------- Populate #pageTitle for Interface Traffic / Errors ---------------
// The upstream click handlers for individual interfaces (inside
// #ulInterfaceTraffic and #ulInterfaceErrors) call chartPage() + render
// charts but never set #pageTitle. Patch by listening for clicks on those
// lists and setting the title from the clicked link's text.
(function () {
  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('#ulInterfaceTraffic a, #ulInterfaceErrors a');
    if (!link) return;
    var name = (link.textContent || '').trim();
    var section = link.closest('#ulInterfaceTraffic') ? 'Interface Traffic' : 'Interface Errors';
    // Small delay so chartPage() runs first and clears the title.
    setTimeout(function () {
      var el = document.getElementById('pageTitle');
      if (el) el.textContent = section + ' — ' + name;
    }, 50);
  });
})();


// ---------- Set #pageTitle to "Dashboard" on dashboard view -----------------
// The app clears #pageTitle when returning to dashboard. We set it to
// "Dashboard" so the user has orientation. Also manage a .title-empty class
// on the parent row for browsers without :has() support.
(function () {
  function updateTitleVisibility() {
    var el = document.getElementById('pageTitle');
    if (!el) return;
    var row = el.closest && el.closest('.contABlock.section-header');
    if (!row) return;
    var isEmpty = !(el.textContent || '').trim();
    row.classList.toggle('title-empty', isEmpty);
  }

  // When Dashboard is clicked (sidebar #btnSAR), set the title.
  document.addEventListener('click', function (e) {
    var hit = e.target.closest && e.target.closest('#btnSAR');
    if (!hit) return;
    setTimeout(function () {
      var el = document.getElementById('pageTitle');
      if (el && !(el.textContent || '').trim()) {
        el.textContent = 'Dashboard';
      }
      updateTitleVisibility();
    }, 100);
  });

  // Observe #pageTitle for any changes and toggle the empty class.
  function startTitleObserver() {
    var el = document.getElementById('pageTitle');
    if (!el) return setTimeout(startTitleObserver, 200);
    var mo = new MutationObserver(updateTitleVisibility);
    mo.observe(el, { childList: true, characterData: true, subtree: true });
    updateTitleVisibility();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startTitleObserver);
  } else {
    startTitleObserver();
  }
})();


// ---------- Peak-box arrow links -> navigate to relevant chart ---------------
// The three peak metric boxes (CPU / Load / Memory) have arrow links that
// were never wired in the upstream JS. Connect them to the corresponding
// sidebar buttons so clicking the arrow navigates to that chart view.
(function () {
  var mapping = {
    btnCPUArrow: function () {
      // Click the "all" CPU entry in the sidebar list.
      var links = document.querySelectorAll('#ulCPU a[data-sns]');
      for (var i = 0; i < links.length; i++) {
        if ((links[i].textContent || '').trim() === 'all') {
          links[i].click();
          return;
        }
      }
      // Fallback: click the CPU dropdown toggle.
      var btn = document.getElementById('btnCPUs');
      if (btn) btn.click();
    },
    btnLoadArrow: function () {
      var btn = document.getElementById('btnLoad');
      if (btn) btn.click();
    },
    btnMemoryArrow: function () {
      // Open the Memory submenu and click "Memory Used"
      var btn = document.getElementById('btnMemUsg');
      if (btn) { btn.click(); return; }
      var parent = document.getElementById('btnMem');
      if (parent) parent.click();
    }
  };

  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('#btnCPUArrow, #btnLoadArrow, #btnMemoryArrow');
    if (!link) return;
    e.preventDefault();
    var handler = mapping[link.id];
    if (handler) handler();
  });
})();


// ---------- Hide "System" section label when its items are hidden ------------
// On Linux, btnSysCalls / btnTTY are hidden by the app after upload. On
// AIX/Solaris they get .show added. We hide the label via CSS by default
// and only reveal it here if any system item becomes visible.
(function () {
  function checkSystemSection() {
    var label = document.querySelector('.sidebar-section-system');
    if (!label) return;
    var items = [
      document.getElementById('btnSysCalls'),
      document.getElementById('btnTTY'),
      document.getElementById('btnFile')
    ];
    var anyVisible = items.some(function (el) {
      if (!el) return false;
      // The app adds .show class to visible items and/or sets inline display.
      return el.classList.contains('show') ||
             (el.style.display && el.style.display !== 'none');
    });
    label.style.display = anyVisible ? '' : 'none';
  }

  // Re-check periodically after data loads since the app's show/hide calls
  // fire asynchronously via setTimeout.
  var interval = setInterval(checkSystemSection, 1000);
  // Stop checking after 30 seconds to avoid infinite polling.
  setTimeout(function () { clearInterval(interval); }, 30000);
})();


// ---------- Sidebar active state management ----------------------------------
// The upstream app never moves the .active class between sidebar items.
// We manage it here: clicking any sidebar link marks its parent <li> as
// active and removes .active from all others.
(function () {
  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('#sidebar ul.sidebar-nav > li > a');
    if (!link) return;
    var allItems = document.querySelectorAll('#sidebar ul.sidebar-nav > li');
    for (var i = 0; i < allItems.length; i++) {
      allItems[i].classList.remove('active');
    }
    var parentLi = link.closest('li');
    if (parentLi) parentLi.classList.add('active');
  });

  // Also handle clicks on sub-items (CPU cores, devices, interfaces) —
  // mark the parent dropdown <li> as active.
  document.addEventListener('click', function (e) {
    var subLink = e.target.closest && e.target.closest('#sidebar ul.sidebar-nav ul a');
    if (!subLink) return;
    var allItems = document.querySelectorAll('#sidebar ul.sidebar-nav > li');
    for (var i = 0; i < allItems.length; i++) {
      allItems[i].classList.remove('active');
    }
    // Find the top-level <li> ancestor
    var topLi = subLink.closest('ul.sidebar-nav > li');
    if (topLi) topLi.classList.add('active');
  });
})();


// ---------- "Try with sample data" button ------------------------------------
// Fetches a bundled sample SAR file and feeds it to the app's upload flow
// as if the user had dropped it on the dropzone.
(function () {
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('#btnTrySample');
    if (!btn) return;
    e.preventDefault();

    // Show spinner
    var spinner = document.getElementById('spinner');
    if (spinner) {
      spinner.classList.remove('d-none', 'hide');
      spinner.classList.add('d-block', 'show');
    }
    if (typeof updateProgress === 'function') updateProgress(5, 'Downloading sample data...');

    fetch('/sample/sample-sar.txt')
      .then(function (res) {
        if (!res.ok) throw new Error('Sample file not found');
        return res.text();
      })
      .then(function (text) {
        if (typeof updateProgress === 'function') updateProgress(15, 'Loading sample data...');

        // Create a fake FileReader result event and feed it to the app
        var fakeEvent = { target: { result: text } };

        // Set the filename display
        var fnEl = document.querySelector('.fileinput-filename');
        if (fnEl) fnEl.textContent = 'sample-sar.txt (built-in sample)';

        // Mark file as loaded (the app checks this global)
        window.file = true;

        // Store for the chunked parser's "Process Data" flow
        window._pendingResult = fakeEvent;

        if (typeof updateProgress === 'function') updateProgress(100, 'File loaded — ready to process');

        // Show the Process Data button
        var processBtn = document.getElementById('btnProcessData');
        if (processBtn) {
          processBtn.style.display = '';
          // Auto-click it for a seamless experience
          setTimeout(function () { processBtn.click(); }, 300);
        }
      })
      .catch(function (err) {
        console.error('[SARkart] Failed to load sample:', err);
        if (typeof updateProgress === 'function') updateProgress(0, 'Failed to load sample data');
      });
  });
})();
