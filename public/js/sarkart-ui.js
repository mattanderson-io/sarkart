/**
 * SARkart v2 UI layer — theme, command palette, shortcuts, progress.
 * Load after sarkart-v1.0.0.min.js and before landing.js.
 */
(function () {
  'use strict';

  var THEME_KEY = 'sarkart-theme';
  var THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

  /* --- Theme -------------------------------------------------------------- */
  function readThemeCookie() {
    var match = document.cookie.match(/(?:^|;\s*)sarkart-theme=(light|dark)(?:;|$)/);
    return match ? match[1] : null;
  }

  function writeThemeCookie(theme) {
    document.cookie = THEME_KEY + '=' + theme + '; path=/; max-age=' + THEME_COOKIE_MAX_AGE + '; SameSite=Lax';
  }

  function getTheme() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  }

  function setTheme(theme) {
    if (theme !== 'light' && theme !== 'dark') theme = 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    writeThemeCookie(theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
    window.dispatchEvent(new CustomEvent('sarkart-theme-change', { detail: { theme: theme } }));
  }

  function initTheme() {
    var saved = readThemeCookie();
    if (!saved) {
      try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
      if (saved === 'light' || saved === 'dark') writeThemeCookie(saved);
    }
    if (saved === 'light' || saved === 'dark') {
      setTheme(saved);
    } else {
      setTheme('dark');
    }
  }

  function wireThemeToggle() {
    var btn = document.getElementById('btnThemeToggle');
    if (!btn) return;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      setTheme(getTheme() === 'dark' ? 'light' : 'dark');
    });
  }

  /* --- Progress enhancement ----------------------------------------------- */
  var progressMeta = { startMs: 0, bytes: 0, stage: 'reading' };

  function setProgressStage(stage) {
    progressMeta.stage = stage;
    var stages = document.querySelectorAll('.progress-stage');
    var order = ['reading', 'parsing', 'rendering'];
    var idx = order.indexOf(stage);
    stages.forEach(function (el, i) {
      el.classList.remove('is-active', 'is-done');
      if (i < idx) el.classList.add('is-done');
      else if (i === idx) el.classList.add('is-active');
    });
  }

  function wrapUpdateProgress() {
    if (typeof window.updateProgress !== 'function' || window.__updateProgressWrapped) return;
    var orig = window.updateProgress;
    window.updateProgress = function (pct, msg) {
      var p = Number(pct) || 0;
      if (p > 0 && !progressMeta.startMs) progressMeta.startMs = Date.now();
      if (p <= 5) { progressMeta.startMs = Date.now(); setProgressStage('reading'); }
      else if (p < 85) setProgressStage('parsing');
      else setProgressStage('rendering');

      var rateEl = document.getElementById('progressRate');
      if (rateEl && progressMeta.bytes && progressMeta.startMs) {
        var elapsed = (Date.now() - progressMeta.startMs) / 1000;
        if (elapsed > 0.2) {
          var mbps = (progressMeta.bytes / (1024 * 1024)) / elapsed;
          rateEl.textContent = mbps.toFixed(1) + ' MB/s';
        }
      }

      return orig.apply(this, arguments);
    };
    window.__updateProgressWrapped = true;
  }

  function trackFileSize(file) {
    if (file && file.size) progressMeta.bytes = file.size;
  }

  /* Hook FileReader path via dropzone input */
  function wireFileTracking() {
    document.addEventListener('change', function (e) {
      if (e.target && e.target.type === 'file' && e.target.files && e.target.files[0]) {
        trackFileSize(e.target.files[0]);
      }
    }, true);
  }

  /* --- Command palette ---------------------------------------------------- */
  var cmdkOpen = false;
  var cmdkItems = [];
  var cmdkSel = 0;

  function navLinks() {
    var links = [];
    var nodes = document.querySelectorAll('#sidebar ul.sidebar-nav a[href]');
    for (var i = 0; i < nodes.length; i++) {
      var a = nodes[i];
      if (a.getAttribute('data-bs-toggle') === 'collapse') continue;
      var label = (a.textContent || '').replace(/\s+/g, ' ').trim();
      if (!label) continue;
      var section = '';
      var sec = a.closest('ul');
      if (sec && sec.id) {
        var parentA = document.querySelector('a[href="#' + sec.id + '"]');
        if (parentA) section = (parentA.textContent || '').trim();
      }
      links.push({ el: a, label: label, section: section || 'Navigation' });
    }
    return links;
  }

  function openCmdk() {
    if (cmdkOpen) return;
    cmdkOpen = true;
    cmdkItems = navLinks();
    cmdkSel = 0;

    var overlay = document.createElement('div');
    overlay.className = 'cmdk-overlay';
    overlay.id = 'cmdkOverlay';
    overlay.innerHTML =
      '<div class="cmdk" role="dialog" aria-label="Command palette" aria-modal="true">' +
        '<div class="cmdk-input-wrap">' +
          '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>' +
          '<input class="cmdk-input" id="cmdkInput" type="text" placeholder="Jump to chart, device, or interface…" autocomplete="off" spellcheck="false">' +
          '<span class="cmdk-esc">esc</span>' +
        '</div>' +
        '<div class="cmdk-list" id="cmdkList" role="listbox"></div>' +
        '<div class="cmdk-footer"><span><kbd>↑↓</kbd> navigate</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div>' +
      '</div>';

    document.body.appendChild(overlay);
    renderCmdkList('');
    var input = document.getElementById('cmdkInput');
    input.focus();
    input.addEventListener('input', function () { renderCmdkList(input.value); });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeCmdk();
    });
  }

  function closeCmdk() {
    cmdkOpen = false;
    var el = document.getElementById('cmdkOverlay');
    if (el) el.remove();
  }

  function renderCmdkList(query) {
    var list = document.getElementById('cmdkList');
    if (!list) return;
    var q = (query || '').toLowerCase().trim();
    var filtered = cmdkItems.filter(function (item) {
      if (!q) return true;
      return (item.label + ' ' + item.section).toLowerCase().indexOf(q) >= 0;
    });
    if (cmdkSel >= filtered.length) cmdkSel = Math.max(0, filtered.length - 1);

    if (!filtered.length) {
      list.innerHTML = '<div class="cmdk-empty">No matching charts</div>';
      return;
    }

    var groups = {};
    filtered.forEach(function (item, i) {
      if (!groups[item.section]) groups[item.section] = [];
      groups[item.section].push({ item: item, idx: i });
    });

    var html = '';
    Object.keys(groups).sort().forEach(function (sec) {
      html += '<div class="cmdk-group-label">' + sec + '</div>';
      groups[sec].forEach(function (row) {
        var sel = row.idx === cmdkSel ? ' is-selected' : '';
        html += '<div class="cmdk-item' + sel + '" data-idx="' + row.idx + '" role="option">' +
          '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg>' +
          '<span class="cmdk-item-name">' + row.item.label + '</span>' +
          (row.item.section !== 'Navigation' ? '<span class="cmdk-item-context">' + row.item.section + '</span>' : '') +
        '</div>';
      });
    });
    list.innerHTML = html;

    list.querySelectorAll('.cmdk-item').forEach(function (el) {
      el.addEventListener('click', function () {
        var idx = parseInt(el.getAttribute('data-idx'), 10);
        execCmdk(filtered[idx]);
      });
    });

    var selected = list.querySelector('.cmdk-item.is-selected');
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }

  function execCmdk(item) {
    if (!item || !item.el) return;
    closeCmdk();
    item.el.click();
  }

  function wireCmdkKeys() {
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (cmdkOpen) closeCmdk(); else openCmdk();
        return;
      }
      if (!cmdkOpen) return;

      var input = document.getElementById('cmdkInput');
      var q = input ? input.value : '';
      var filtered = cmdkItems.filter(function (item) {
        if (!q) return true;
        return (item.label + ' ' + item.section).toLowerCase().indexOf(q.toLowerCase()) >= 0;
      });

      if (e.key === 'Escape') { e.preventDefault(); closeCmdk(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); cmdkSel = Math.min(cmdkSel + 1, filtered.length - 1); renderCmdkList(q); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cmdkSel = Math.max(cmdkSel - 1, 0); renderCmdkList(q); }
      else if (e.key === 'Enter') { e.preventDefault(); execCmdk(filtered[cmdkSel]); }
    });
  }

  /* --- Keyboard shortcuts ------------------------------------------------- */
  function chartNavLinks() {
    return Array.prototype.slice.call(
      document.querySelectorAll('#sidebar ul.sidebar-nav a[href]:not([data-bs-toggle])')
    ).filter(function (a) {
      return a.offsetParent !== null || a.classList.contains('show');
    });
  }

  function wireShortcuts() {
    document.addEventListener('keydown', function (e) {
      if (cmdkOpen) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        var btn = document.getElementById('sidebarCollapse');
        if (btn) btn.click();
      }

      if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey) {
        var links = chartNavLinks();
        var active = document.querySelector('#sidebar ul.sidebar-nav li.active a');
        var idx = active ? links.indexOf(active) : -1;
        if (idx >= 0 && idx < links.length - 1) { e.preventDefault(); links[idx + 1].click(); }
      }
      if ((e.key === 'p' || e.key === 'P') && !e.metaKey && !e.ctrlKey) {
        var links2 = chartNavLinks();
        var active2 = document.querySelector('#sidebar ul.sidebar-nav li.active a');
        var idx2 = active2 ? links2.indexOf(active2) : -1;
        if (idx2 > 0) { e.preventDefault(); links2[idx2 - 1].click(); }
      }

      if (e.key === '0' && e.metaKey) {
        e.preventDefault();
        if (typeof window.Plotly !== 'undefined') {
          ['containerA', 'containerB', 'containerC', 'containerD'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el && el.data) try { window.Plotly.relayout(el, { 'xaxis.autorange': true, 'yaxis.autorange': true }); } catch (err) {}
          });
        }
      }
    });
  }

  /* --- PDF export button relocation --------------------------------------- */
  function relocateExportBtn() {
    var btn = document.getElementById('btnExportPDF');
    var panel = document.getElementById('topBarMenuPanel');
    var openAnother = document.getElementById('btnOpenAnother');
    if (!btn || !panel || btn.__relocated) return;
    btn.className = 'top-bar-menu-item hide';
    btn.setAttribute('role', 'menuitem');
    btn.innerHTML =
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M10 13h4M10 17h4"/></svg> Export PDF';
    if (openAnother && openAnother.nextSibling) {
      panel.insertBefore(btn, openAnother.nextSibling);
    } else {
      panel.insertBefore(btn, panel.firstChild);
    }
    btn.__relocated = true;
  }

  /* --- Top bar hamburger menu --------------------------------------------- */
  function wireTopMenu() {
    var btn = document.getElementById('btnTopMenu');
    var panel = document.getElementById('topBarMenuPanel');
    if (!btn || !panel) return;

    function closeMenu() {
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var open = panel.hidden;
      panel.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    document.addEventListener('click', function (e) {
      if (!e.target.closest || !e.target.closest('.top-bar-menu')) closeMenu();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) closeMenu();
    });

    panel.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.top-bar-menu-item')) closeMenu();
    });
  }

  function watchExportBtn() {
    var obs = new MutationObserver(relocateExportBtn);
    obs.observe(document.body, { childList: true, subtree: true });
    setInterval(relocateExportBtn, 1000);
    setTimeout(function () { obs.disconnect(); }, 30000);
  }

  /* --- CPU chip bar ---------------------------------------------------------- */
  /* Per-CPU navigation renders as a row of chips above the charts instead of a
     huge sidebar submenu. The engine still injects the per-CPU links into
     #ulCPU (hidden via CSS); chips proxy clicks to them. */
  function cpuLinks() {
    return Array.prototype.slice.call(document.querySelectorAll('#ulCPU a'));
  }

  /* With hundreds of cores the chips would fill the screen, so the chip list
     is a 2-row viewport: ‹ › page it two rows at a time, "Show all N" expands
     the full grid. Bars that fit in 2 rows show no controls at all. */
  var cpuChipsExpanded = false;

  function ensureCpuChipBar() {
    var bar = document.getElementById('cpuChipBar');
    var anchor = document.querySelector('.page-title-row');
    if (bar) {
      if (anchor && anchor.parentNode && bar.nextElementSibling !== anchor) {
        anchor.parentNode.insertBefore(bar, anchor);
      }
      return bar;
    }
    if (!anchor || !anchor.parentNode) return null;
    bar = document.createElement('div');
    bar.id = 'cpuChipBar';
    bar.className = 'cpu-chip-bar';
    bar.hidden = true;

    var label = document.createElement('span');
    label.className = 'cpu-chip-bar-label';
    label.textContent = 'CPU';
    bar.appendChild(label);

    var wrap = document.createElement('div');
    wrap.className = 'cpu-chips scrolling';
    wrap.addEventListener('scroll', syncChipSteppers);
    bar.appendChild(wrap);

    var controls = document.createElement('div');
    controls.className = 'cpu-chip-bar-controls';
    controls.innerHTML =
      '<button type="button" class="cpu-chip-page" data-dir="-1" aria-label="Previous cores">' +
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>' +
      '</button>' +
      '<button type="button" class="cpu-chip-page" data-dir="1" aria-label="Next cores">' +
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>' +
      '</button>' +
      '<button type="button" class="cpu-chip-more"></button>';
    controls.querySelectorAll('.cpu-chip-page').forEach(function (btn) {
      btn.addEventListener('click', function () {
        pageChips(parseInt(btn.getAttribute('data-dir'), 10));
      });
    });
    controls.querySelector('.cpu-chip-more').addEventListener('click', function () {
      cpuChipsExpanded = !cpuChipsExpanded;
      syncChipOverflow();
    });
    bar.appendChild(controls);

    anchor.parentNode.insertBefore(bar, anchor);
    return bar;
  }

  function pageChips(dir) {
    var wrap = document.querySelector('#cpuChipBar .cpu-chips');
    if (wrap) wrap.scrollBy({ top: dir * wrap.clientHeight, behavior: 'smooth' });
  }

  function syncChipSteppers() {
    var bar = document.getElementById('cpuChipBar');
    if (!bar) return;
    var wrap = bar.querySelector('.cpu-chips');
    var prev = bar.querySelector('.cpu-chip-page[data-dir="-1"]');
    var next = bar.querySelector('.cpu-chip-page[data-dir="1"]');
    if (!wrap || !prev || !next) return;
    prev.disabled = wrap.scrollTop <= 0;
    next.disabled = wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 1;
  }

  /* Cap the viewport at two chip rows (measured, so it tracks font size) and
     show the paging controls only when the chips actually overflow. */
  function syncChipOverflow() {
    var bar = document.getElementById('cpuChipBar');
    if (!bar || bar.hidden) return;
    var wrap = bar.querySelector('.cpu-chips');
    var chip = wrap.querySelector('.cpu-chip');
    if (!chip) return;
    var gap = 6;
    wrap.style.maxHeight = cpuChipsExpanded ? 'none' : (chip.offsetHeight * 2 + gap) + 'px';
    bar.classList.toggle('is-expanded', cpuChipsExpanded);
    // When expanded there is no scroll overflow, but the controls must stay
    // so the bar can be collapsed again.
    var overflows = cpuChipsExpanded || wrap.scrollHeight > wrap.clientHeight + 1;
    bar.classList.toggle('has-overflow', overflows);
    bar.querySelector('.cpu-chip-more').textContent = cpuChipsExpanded
      ? 'Show fewer'
      : 'Show all ' + wrap.querySelectorAll('.cpu-chip').length;
    syncChipSteppers();
  }

  function scrollChipIntoView(chip) {
    var wrap = chip && chip.parentElement;
    if (!wrap || cpuChipsExpanded) return;
    var top = chip.offsetTop; // .cpu-chips is position:relative
    if (top < wrap.scrollTop || top + chip.offsetHeight > wrap.scrollTop + wrap.clientHeight) {
      wrap.scrollTop = top;
    }
  }

  function renderCpuChips(activeLink) {
    var links = cpuLinks();
    var bar = ensureCpuChipBar();
    if (!bar || !links.length) return;
    var wrap = bar.querySelector('.cpu-chips');
    if (wrap.querySelectorAll('.cpu-chip').length !== links.length) {
      wrap.innerHTML = '';
      links.forEach(function (a, i) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'cpu-chip';
        chip.textContent = (a.textContent || '').replace(/\s+/g, ' ').trim();
        chip.addEventListener('click', function () {
          var target = cpuLinks()[i];
          if (target) target.click();
        });
        wrap.appendChild(chip);
      });
    }
    var idx = links.indexOf(activeLink);
    var activeChip = null;
    wrap.querySelectorAll('.cpu-chip').forEach(function (chip, i) {
      chip.classList.toggle('is-active', i === idx);
      if (i === idx) activeChip = chip;
    });
    bar.hidden = false;
    syncChipOverflow();
    if (activeChip) scrollChipIntoView(activeChip);
  }

  function hideCpuChips() {
    var bar = document.getElementById('cpuChipBar');
    if (bar) bar.hidden = true;
  }

  function wireCpuChips() {
    var chipResizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(chipResizeTimer);
      chipResizeTimer = setTimeout(syncChipOverflow, 150);
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest) return;
      if (e.target.closest('#btnCPUs')) {
        e.preventDefault();
        var links = cpuLinks();
        if (links.length) links[0].click();
        return;
      }
      var cpuLink = e.target.closest('#ulCPU a');
      if (cpuLink) { renderCpuChips(cpuLink); return; }
      // Navigating anywhere else dismisses the chip bar
      if (e.target.closest('#sidebar ul.sidebar-nav a')) hideCpuChips();
    });
  }

  /* --- Dashboard-only blocks -------------------------------------------------- */
  /* The KPI cards (#peakBlock) and performance summary belong to the dashboard
     view only; CSS hides them unless body.is-dashboard is set. */
  function wireDashboardState() {
    document.body.classList.add('is-dashboard');
    document.addEventListener('click', function (e) {
      if (!e.target.closest) return;
      var link = e.target.closest('#sidebar ul.sidebar-nav a');
      if (!link) return;
      if (link.getAttribute('data-bs-toggle') === 'collapse') return; // just expanding a menu
      document.body.classList.toggle('is-dashboard', link.id === 'btnSAR');
    });
  }

  /* --- Empty sidebar sections ----------------------------------------------- */
  /* The legacy engine hides charts that have no data in the loaded file by
     toggling .hide/.show on the sidebar anchors. Hide a section label when
     every item under it (up to the next label) is hidden, so no orphaned
     headings like "SYSTEM" linger. */
  function updateSectionLabels() {
    var labels = document.querySelectorAll('#sidebar .sidebar-section-label');
    labels.forEach(function (label) {
      var anyVisible = false;
      var sib = label.nextElementSibling;
      while (sib && !sib.classList.contains('sidebar-section-label')) {
        var a = sib.querySelector('a');
        if (a && !(a.classList.contains('hide') && !a.classList.contains('show'))) {
          anyVisible = true;
          break;
        }
        sib = sib.nextElementSibling;
      }
      if (label.classList.contains('is-empty') === anyVisible) {
        label.classList.toggle('is-empty', !anyVisible);
      }
    });
  }

  function wireSectionLabels() {
    var nav = document.querySelector('#sidebar ul.sidebar-nav');
    if (!nav) return;
    updateSectionLabels();
    var obs = new MutationObserver(updateSectionLabels);
    obs.observe(nav, { attributes: true, attributeFilter: ['class'], subtree: true });
  }

  /* --- Sidebar collapse (stable, no layout jump) ---------------------------- */
  function wireSidebar() {
    var sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    // The legacy engine already toggles .active on #sidebar when the collapse
    // button is clicked — adding a second toggle here would cancel it out.
    // Just mirror the sidebar state onto <body> for layout hooks.
    var sync = function () {
      var collapsed = sidebar.classList.contains('active');
      document.body.classList.toggle('sidebar-collapsed', collapsed);
      var btn = document.getElementById('sidebarCollapse');
      if (btn) {
        var label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
        btn.setAttribute('aria-label', label);
        btn.title = label + ' (⌘B)';
      }
    };
    new MutationObserver(sync).observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    sync();
  }

  function wireCmdkButton() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('#btnCmdk');
      if (!btn) return;
      e.preventDefault();
      if (cmdkOpen) closeCmdk(); else openCmdk();
    });
  }

  /* --- chartPage fast path -------------------------------------------------- */
  /* displayTitle() calls chartPage() on every CPU switch. The legacy
     chartPage() hides all .homeContBlock then re-shows chart rows 10ms later,
     which briefly collapses the page and flashes the footer into view. */
  function chartBlocksActive() {
    return ['A', 'B', 'C', 'D', 'M'].some(function (id) {
      var block = document.querySelector('.cont' + id + 'Block');
      return block && block.classList.contains('add') && block.offsetParent !== null;
    });
  }

  function wrapChartPage() {
    if (typeof window.chartPage !== 'function' || window.__chartPageWrapped) return;
    var orig = window.chartPage;
    window.chartPage = function () {
      if (chartBlocksActive() && window.file) {
        var debugOn = typeof window.DEBUG !== 'undefined' && window.DEBUG === 1;
        if (debugOn && typeof window.showBlock === 'function') window.showBlock('M');
        for (var t = 0; t < 4; t++) {
          var slot = String.fromCharCode(65 + t);
          if (typeof window.showBlock === 'function') window.showBlock(slot);
          var titleEl = document.getElementById('container' + slot + 'Title');
          var notesEl = document.getElementById('container' + slot + 'Notes');
          if (titleEl) titleEl.innerHTML = '';
          if (notesEl) notesEl.innerHTML = '';
        }
        return;
      }
      return orig.apply(this, arguments);
    };
    window.__chartPageWrapped = true;
  }

  /* --- Init ---------------------------------------------------------------- */
  function start() {
    initTheme();
    wireThemeToggle();
    wrapUpdateProgress();
    wrapChartPage();
    wireFileTracking();
    wireCmdkKeys();
    wireCmdkButton();
    wireTopMenu();
    wireShortcuts();
    wireSidebar();
    wireSectionLabels();
    wireCpuChips();
    wireDashboardState();
    watchExportBtn();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
