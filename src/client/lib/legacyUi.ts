/**
 * Port of the "always-run" behaviors from the legacy `public/js/sarkart-ui.js`
 * so that last legacy script can be retired.
 *
 * sarkart-ui.js guarded its theme / command-palette / top-menu / export-button
 * relocation behind `!window.__sarkartPreactTopUi` — the Preact shell sets that
 * flag true, so those blocks never ran under the migrated app (they are owned
 * by `Content.tsx`'s TopBar and `CommandPalette.tsx`). What remained live were
 * the un-guarded behaviors ported here:
 *
 *   1. Progress-bar stage/rate enhancement (wraps `window.updateProgress`).
 *   2. `chartPage()` fast path that avoids the footer-flash on CPU switches.
 *   3. Keyboard shortcuts (⌘B collapse, n/p prev/next chart, ⌘0 reset zoom).
 *   4. Sidebar collapse toggle + body-class mirror.
 *   5. Empty sidebar-section-label hiding.
 *   6. The per-CPU chip bar.
 *   7. `body.is-dashboard` state for the KPI cards / summary.
 *
 * NOTE (bug fix vs. the original): sarkart-ui.js's `wireSidebar` only *mirrored*
 * `#sidebar.active` onto `<body>` and relied on the (now-deleted) legacy engine
 * to actually toggle `.active` when `#sidebarCollapse` was clicked. With that
 * engine gone the toggle was dead, so `installSidebar` here also owns the click
 * -> `#sidebar.active` toggle.
 *
 * `installLegacyUi()` wires everything and returns a teardown that removes the
 * listeners/observers it added. `wrapUpdateProgress`/`wrapChartPage` patch the
 * corresponding globals in place (guarded so they only wrap once); they must run
 * after `CoreEngineBridge` has installed those globals, which the mount order in
 * `App.tsx` guarantees.
 */

import { showBlock } from './sarEngine';

type Teardown = () => void;

function cmdkIsOpen(): boolean {
  return !!document.getElementById('cmdkOverlay');
}

/* --- Progress enhancement ------------------------------------------------- */

const progressMeta = { startMs: 0, bytes: 0, stage: 'reading' };

function setProgressStage(stage: string) {
  progressMeta.stage = stage;
  const stages = document.querySelectorAll<HTMLElement>('.progress-stage');
  const order = ['reading', 'parsing', 'rendering'];
  const idx = order.indexOf(stage);
  stages.forEach((el, i) => {
    el.classList.remove('is-active', 'is-done');
    if (i < idx) el.classList.add('is-done');
    else if (i === idx) el.classList.add('is-active');
  });
}

/**
 * Decide which stepper stage a progress update belongs to. Prefer the message,
 * which unambiguously names the phase — the percent alone cannot, because the
 * file-read phase reports its own 0-100% (of bytes) before processing starts
 * its 25-100% pass. Judging by percent made the read's tail look like
 * "rendering" and then the stepper visibly rewound to "reading" when parsing
 * began. Falls back to percent only when no message is given (e.g. the reset
 * to 0 that hides the spinner).
 */
function stageForProgress(pct: number, msg?: string): string {
  const m = (msg || '').toLowerCase();
  if (!m) return pct <= 5 ? 'reading' : pct < 85 ? 'parsing' : 'rendering';
  if (m.includes('parsing')) return 'parsing';
  // Note: match "reading" (not bare "read") and the full "ready to process"
  // phrase, so the "rendering"-phase message "Almost ready…" is NOT caught here.
  if (/reading|uploading|downloading|ready to process|loading sample|preparing|error|failed/.test(m)) {
    return 'reading';
  }
  // Everything else that carries a message is the build/render phase:
  // "Building data index", "Detecting server info", "Loading dashboard",
  // "Calculating peak values", "Loading devices & interfaces", "Almost ready",
  // "Done!", "Unsupported OS", PDF "Exporting…"/"Generating…".
  return 'rendering';
}

function wrapUpdateProgress() {
  if (typeof window.updateProgress !== 'function' || window.__updateProgressWrapped) return;
  const orig = window.updateProgress;
  window.updateProgress = function (pct: number, msg?: string) {
    const p = Number(pct) || 0;
    if (p > 0 && !progressMeta.startMs) progressMeta.startMs = Date.now();
    if (p <= 5) progressMeta.startMs = Date.now();
    setProgressStage(stageForProgress(p, msg));

    const rateEl = document.getElementById('progressRate');
    if (rateEl && progressMeta.bytes && progressMeta.startMs) {
      const elapsed = (Date.now() - progressMeta.startMs) / 1000;
      if (elapsed > 0.2) {
        const mbps = progressMeta.bytes / (1024 * 1024) / elapsed;
        rateEl.textContent = `${mbps.toFixed(1)} MB/s`;
      }
    }

    return orig.call(this, p, msg);
  };
  window.__updateProgressWrapped = true;
}

function installFileTracking(): Teardown {
  const onChange = (event: Event) => {
    const target = event.target as HTMLInputElement | null;
    if (target && target.type === 'file' && target.files && target.files[0]) {
      const file = target.files[0];
      if (file.size) progressMeta.bytes = file.size;
    }
  };
  document.addEventListener('change', onChange, true);
  return () => document.removeEventListener('change', onChange, true);
}

/* --- chartPage fast path -------------------------------------------------- */

function chartBlocksActive(): boolean {
  return ['A', 'B', 'C', 'D', 'M'].some((id) => {
    const block = document.querySelector<HTMLElement>(`.cont${id}Block`);
    return !!block && block.classList.contains('add') && block.offsetParent !== null;
  });
}

function wrapChartPage() {
  if (typeof window.chartPage !== 'function' || window.__chartPageWrapped) return;
  const orig = window.chartPage;
  window.chartPage = function () {
    if (chartBlocksActive() && window.file) {
      const debugOn = typeof window.DEBUG !== 'undefined' && window.DEBUG === 1;
      if (debugOn) showBlock('M');
      for (let t = 0; t < 4; t++) {
        const slot = String.fromCharCode(65 + t);
        showBlock(slot);
        const titleEl = document.getElementById(`container${slot}Title`);
        const notesEl = document.getElementById(`container${slot}Notes`);
        if (titleEl) titleEl.innerHTML = '';
        if (notesEl) notesEl.innerHTML = '';
      }
      return;
    }
    return orig.call(this);
  };
  window.__chartPageWrapped = true;
}

/* --- Keyboard shortcuts --------------------------------------------------- */

function chartNavLinks(): HTMLAnchorElement[] {
  return Array.from(
    document.querySelectorAll<HTMLAnchorElement>('#sidebar ul.sidebar-nav a[href]:not([data-bs-toggle])')
  ).filter((a) => a.offsetParent !== null || a.classList.contains('show'));
}

function installShortcuts(): Teardown {
  const onKeyDown = (e: KeyboardEvent) => {
    if (cmdkIsOpen()) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

    if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault();
      document.getElementById('sidebarCollapse')?.click();
    }

    if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey) {
      const links = chartNavLinks();
      const active = document.querySelector<HTMLAnchorElement>('#sidebar ul.sidebar-nav li.active a');
      const idx = active ? links.indexOf(active) : -1;
      if (idx >= 0 && idx < links.length - 1) {
        e.preventDefault();
        links[idx + 1].click();
      }
    }
    if ((e.key === 'p' || e.key === 'P') && !e.metaKey && !e.ctrlKey) {
      const links = chartNavLinks();
      const active = document.querySelector<HTMLAnchorElement>('#sidebar ul.sidebar-nav li.active a');
      const idx = active ? links.indexOf(active) : -1;
      if (idx > 0) {
        e.preventDefault();
        links[idx - 1].click();
      }
    }

    if (e.key === '0' && e.metaKey) {
      e.preventDefault();
      const Plotly = window.Plotly;
      if (Plotly && typeof Plotly.relayout === 'function') {
        ['containerA', 'containerB', 'containerC', 'containerD'].forEach((id) => {
          const el = document.getElementById(id) as (HTMLElement & { data?: unknown }) | null;
          if (el && el.data) {
            try {
              Plotly.relayout!(el, { 'xaxis.autorange': true, 'yaxis.autorange': true });
            } catch (_err) {
              /* ignore charts that aren't Plotly-backed */
            }
          }
        });
      }
    }
  };

  document.addEventListener('keydown', onKeyDown);
  return () => document.removeEventListener('keydown', onKeyDown);
}

/* --- Sidebar collapse (toggle + body-class mirror) ------------------------ */

function installSidebar(): Teardown {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return () => {};

  // The legacy engine used to own this click -> `.active` toggle; it was lost
  // when the engine was deleted, so we own it here.
  const onToggleClick = (event: MouseEvent) => {
    event.preventDefault();
    sidebar.classList.toggle('active');
  };
  const toggleBtn = document.getElementById('sidebarCollapse');
  toggleBtn?.addEventListener('click', onToggleClick);

  const sync = () => {
    const collapsed = sidebar.classList.contains('active');
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    const btn = document.getElementById('sidebarCollapse');
    if (btn) {
      const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
      btn.setAttribute('aria-label', label);
      btn.title = `${label} (⌘B)`;
    }
  };
  const observer = new MutationObserver(sync);
  observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
  sync();

  return () => {
    toggleBtn?.removeEventListener('click', onToggleClick);
    observer.disconnect();
  };
}

/* --- Empty sidebar section labels ----------------------------------------- */

function updateSectionLabels() {
  const labels = document.querySelectorAll<HTMLElement>('#sidebar .sidebar-section-label');
  labels.forEach((label) => {
    let anyVisible = false;
    let sib = label.nextElementSibling;
    while (sib && !sib.classList.contains('sidebar-section-label')) {
      const a = sib.querySelector('a');
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

function installSectionLabels(): Teardown {
  const nav = document.querySelector('#sidebar ul.sidebar-nav');
  if (!nav) return () => {};
  updateSectionLabels();
  const observer = new MutationObserver(updateSectionLabels);
  observer.observe(nav, { attributes: true, attributeFilter: ['class'], subtree: true });
  return () => observer.disconnect();
}

/* --- Dashboard-only blocks ------------------------------------------------ */

function installDashboardState(): Teardown {
  document.body.classList.add('is-dashboard');
  const onClick = (e: MouseEvent) => {
    const target = e.target as Element | null;
    const link = target?.closest?.('#sidebar ul.sidebar-nav a');
    if (!link) return;
    if (link.getAttribute('data-bs-toggle') === 'collapse') return; // just expanding a menu
    document.body.classList.toggle('is-dashboard', link.id === 'btnSAR');
  };
  document.addEventListener('click', onClick);
  return () => document.removeEventListener('click', onClick);
}

/* --- CPU chip bar --------------------------------------------------------- */
/* Per-CPU navigation renders as a row of chips above the charts instead of a
   huge sidebar submenu. The engine still injects the per-CPU links into
   #ulCPU (hidden via CSS); chips proxy clicks to them. With hundreds of cores
   the chip list is a 2-row viewport: ‹ › page it two rows at a time, and
   "Show all N" expands the full grid. */

let cpuChipsExpanded = false;

function cpuLinks(): HTMLAnchorElement[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>('#ulCPU a'));
}

function pageChips(dir: number) {
  const wrap = document.querySelector<HTMLElement>('#cpuChipBar .cpu-chips');
  if (wrap) wrap.scrollBy({ top: dir * wrap.clientHeight, behavior: 'smooth' });
}

function syncChipSteppers() {
  const bar = document.getElementById('cpuChipBar');
  if (!bar) return;
  const wrap = bar.querySelector<HTMLElement>('.cpu-chips');
  const prev = bar.querySelector<HTMLButtonElement>('.cpu-chip-page[data-dir="-1"]');
  const next = bar.querySelector<HTMLButtonElement>('.cpu-chip-page[data-dir="1"]');
  if (!wrap || !prev || !next) return;
  prev.disabled = wrap.scrollTop <= 0;
  next.disabled = wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 1;
}

/* Cap the viewport at two chip rows (measured, so it tracks font size) and
   show the paging controls only when the chips actually overflow. */
function syncChipOverflow() {
  const bar = document.getElementById('cpuChipBar');
  if (!bar || (bar as HTMLElement).hidden) return;
  const wrap = bar.querySelector<HTMLElement>('.cpu-chips');
  const chip = wrap?.querySelector<HTMLElement>('.cpu-chip');
  if (!wrap || !chip) return;
  const gap = 6;
  wrap.style.maxHeight = cpuChipsExpanded ? 'none' : `${chip.offsetHeight * 2 + gap}px`;
  bar.classList.toggle('is-expanded', cpuChipsExpanded);
  // When expanded there is no scroll overflow, but the controls must stay so
  // the bar can be collapsed again.
  const overflows = cpuChipsExpanded || wrap.scrollHeight > wrap.clientHeight + 1;
  bar.classList.toggle('has-overflow', overflows);
  const more = bar.querySelector<HTMLElement>('.cpu-chip-more');
  if (more) {
    more.textContent = cpuChipsExpanded
      ? 'Show fewer'
      : `Show all ${wrap.querySelectorAll('.cpu-chip').length}`;
  }
  syncChipSteppers();
}

function scrollChipIntoView(chip: HTMLElement) {
  const wrap = chip.parentElement;
  if (!wrap || cpuChipsExpanded) return;
  const top = chip.offsetTop; // .cpu-chips is position:relative
  if (top < wrap.scrollTop || top + chip.offsetHeight > wrap.scrollTop + wrap.clientHeight) {
    wrap.scrollTop = top;
  }
}

function ensureCpuChipBar(): HTMLElement | null {
  const anchor = document.querySelector<HTMLElement>('.page-title-row');
  let bar = document.getElementById('cpuChipBar');
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
  (bar as HTMLElement).hidden = true;

  const label = document.createElement('span');
  label.className = 'cpu-chip-bar-label';
  label.textContent = 'CPU';
  bar.appendChild(label);

  const wrap = document.createElement('div');
  wrap.className = 'cpu-chips scrolling';
  wrap.addEventListener('scroll', syncChipSteppers);
  bar.appendChild(wrap);

  const controls = document.createElement('div');
  controls.className = 'cpu-chip-bar-controls';
  controls.innerHTML =
    '<button type="button" class="cpu-chip-page" data-dir="-1" aria-label="Previous cores">' +
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>' +
    '</button>' +
    '<button type="button" class="cpu-chip-page" data-dir="1" aria-label="Next cores">' +
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>' +
    '</button>' +
    '<button type="button" class="cpu-chip-more"></button>';
  controls.querySelectorAll<HTMLButtonElement>('.cpu-chip-page').forEach((btn) => {
    btn.addEventListener('click', () => pageChips(parseInt(btn.getAttribute('data-dir') || '0', 10)));
  });
  controls.querySelector<HTMLButtonElement>('.cpu-chip-more')?.addEventListener('click', () => {
    cpuChipsExpanded = !cpuChipsExpanded;
    syncChipOverflow();
  });
  bar.appendChild(controls);

  anchor.parentNode.insertBefore(bar, anchor);
  return bar;
}

function renderCpuChips(activeLink: HTMLAnchorElement) {
  const links = cpuLinks();
  const bar = ensureCpuChipBar();
  if (!bar || !links.length) return;
  const wrap = bar.querySelector<HTMLElement>('.cpu-chips');
  if (!wrap) return;
  if (wrap.querySelectorAll('.cpu-chip').length !== links.length) {
    wrap.innerHTML = '';
    links.forEach((a, i) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'cpu-chip';
      chip.textContent = (a.textContent || '').replace(/\s+/g, ' ').trim();
      chip.addEventListener('click', () => {
        const target = cpuLinks()[i];
        if (target) target.click();
      });
      wrap.appendChild(chip);
    });
  }
  const idx = links.indexOf(activeLink);
  let activeChip: HTMLElement | null = null;
  wrap.querySelectorAll<HTMLElement>('.cpu-chip').forEach((chip, i) => {
    chip.classList.toggle('is-active', i === idx);
    if (i === idx) activeChip = chip;
  });
  (bar as HTMLElement).hidden = false;
  syncChipOverflow();
  if (activeChip) scrollChipIntoView(activeChip);
}

function hideCpuChips() {
  const bar = document.getElementById('cpuChipBar');
  if (bar) (bar as HTMLElement).hidden = true;
}

function installCpuChips(): Teardown {
  let chipResizeTimer: number | undefined;
  const onResize = () => {
    window.clearTimeout(chipResizeTimer);
    chipResizeTimer = window.setTimeout(syncChipOverflow, 150);
  };
  const onClick = (e: MouseEvent) => {
    const target = e.target as Element | null;
    if (!target?.closest) return;
    if (target.closest('#btnCPUs')) {
      e.preventDefault();
      const links = cpuLinks();
      if (links.length) links[0].click();
      return;
    }
    const cpuLink = target.closest<HTMLAnchorElement>('#ulCPU a');
    if (cpuLink) {
      renderCpuChips(cpuLink);
      return;
    }
    // Navigating anywhere else dismisses the chip bar.
    if (target.closest('#sidebar ul.sidebar-nav a')) hideCpuChips();
  };

  window.addEventListener('resize', onResize);
  document.addEventListener('click', onClick);
  return () => {
    window.removeEventListener('resize', onResize);
    document.removeEventListener('click', onClick);
  };
}

/* --- Install ------------------------------------------------------------- */

export function installLegacyUi(): Teardown {
  wrapUpdateProgress();
  wrapChartPage();

  const teardowns: Teardown[] = [
    installFileTracking(),
    installShortcuts(),
    installSidebar(),
    installSectionLabels(),
    installCpuChips(),
    installDashboardState()
  ];

  return () => {
    teardowns.forEach((fn) => fn());
  };
}
