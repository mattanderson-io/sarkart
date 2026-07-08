/**
 * Core SAR "page engine" helpers, ported from `sarkart-v1.0.0.min.js`.
 *
 * These are the state/UI primitives every chart category handler in
 * ChartRouterBridge.tsx calls via `window.*` (showBlock, hideBlock,
 * updateProgress, getOS, getHostname, displayTitle, etc). They previously
 * came from the legacy engine; this module is the typed replacement so the
 * legacy file is no longer load-bearing for navigation/state.
 *
 * Behavioral note: the legacy versions wrapped every DOM mutation in
 * setTimeout(fn, 0|10) — an artifact of the original jQuery event queue
 * ordering (chartPage() needed to run before showBlock() calls queued by
 * the *same* click handler, so the class toggles below (hideBlock/showBlock/etc
 * used the timer to guarantee ordering). Preact's synchronous render plus
 * ChartRouterBridge's synchronous handler bodies make that ordering
 * unnecessary here, so these run synchronously. If a future regression
 * traces back to ordering, reintroduce a 0ms setTimeout wrapper.
 */

const BLOCK_IDS = ['A', 'B', 'C', 'D'] as const;

function query(selector: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(selector));
}

// -- Block visibility (showBlock/hideBlock/add/remove) -----------------------

/**
 * Legacy `showBlock(id)`: reveal a chart row (`.cont{id}Block`).
 * `.contABlock`/etc carry an unconditional `display: none` in CSS (see
 * sarkart-v2.css section 3), so clearing the inline style would just fall
 * back to that rule. jQuery's `.show()` restores the element's default
 * display (`block` for a `<div>`) — set that explicitly to match.
 */
export function showBlock(id: string) {
  query(`.cont${id}Block`).forEach((el) => {
    el.style.display = 'block';
    el.classList.remove('remove');
    el.classList.add('add');
  });
}

/** Legacy `hideBlock(id)`: clear + hide a chart row (`#container{id}` + `.cont{id}Block`). */
export function hideBlock(id: string) {
  const container = document.getElementById(`container${id}`);
  if (container) container.innerHTML = '';
  query(`.cont${id}Block`).forEach((el) => {
    el.style.display = 'none';
    el.classList.remove('add');
    el.classList.add('remove');
  });
}

/** Legacy `show(selector)` / `hide(selector)`: toggle the `.show`/`.hide` compat classes. */
export function show(selector: string) {
  query(selector).forEach((el) => { el.classList.add('show'); el.classList.remove('hide'); });
}

export function hide(selector: string) {
  query(selector).forEach((el) => { el.classList.add('hide'); el.classList.remove('show'); });
}

/** Legacy `showNotes(id, text)`: reveal + set a chart's notes paragraph. */
export function showNotes(id: string, text: string) {
  const el = document.getElementById(`container${id}Notes`);
  if (!el) return;
  el.style.display = '';
  el.textContent = text;
}

// -- Page transitions (chartPage/homePage) -----------------------------------

/**
 * Legacy `chartPage()`: clears the four chart slots ahead of a new category
 * render. The legacy `.homeContBlock`/`.container-notes` hide/show and
 * `#fileinput`/`#btnSave`/`#btnDBGo` toggles targeted v1-only elements that
 * don't exist in the v2 template (visibility is now CSS-driven off
 * `body.data-loaded`/`.is-dashboard`), so only the still-relevant slot-reset
 * behavior is ported.
 */
export function chartPage() {
  const hasFile = Boolean(window.file);
  BLOCK_IDS.forEach((id) => {
    showBlock(id);
    const title = document.getElementById(`container${id}Title`);
    const notes = document.getElementById(`container${id}Notes`);
    if (title) title.innerHTML = '';
    if (notes) notes.innerHTML = '';
  });
  if (!hasFile) {
    showBlock('M');
    const containerM = document.getElementById('containerM');
    if (containerM) {
      containerM.innerHTML = 'No data to display. Please upload a SAR file in <a href=# onclick="document.getElementById(\'btnSAR\').click()">Dashboard</a> Page.';
    }
  }
}

/**
 * Legacy `homePage()`: legacy landing-state reset. In v2 the landing/loaded
 * state is CSS-driven off `body.data-loaded` (see LandingBridge's
 * `#btnOpenAnother` handler, which already clears that class), so the only
 * still-relevant behavior here is resetting the chart slots.
 */
export function homePage() {
  BLOCK_IDS.forEach((id) => hideBlock(id));
  hideBlock('M');
}

// -- Progress ------------------------------------------------------------

/** Legacy `updateProgress(percent, message?)`. */
export function updateProgress(percent: number, message?: string) {
  const val = document.getElementById('spinnerVal');
  const bar = document.getElementById('progressBar');
  if (val) val.textContent = `${percent}%`;
  if (bar) bar.style.width = `${percent}%`;
  if (message) {
    const step = document.getElementById('progressStep');
    if (step) step.textContent = message;
  }
}

/** Legacy `progressBarReset()`. */
export function progressBarReset() {
  const spinner = document.getElementById('spinner');
  if (spinner) {
    spinner.classList.remove('d-block');
    spinner.classList.add('d-none');
  }
  hide('#spinner');
  updateProgress(0);
}

// -- Server/file identity (getOS/getHostname/getKernel/getServerInfo) -------

let osCache: string | null = null;

/** Legacy `getOS()`. Cached like the original (cleared implicitly on reparse via resetOsCache). */
export function getOS() {
  if (osCache !== null) return osCache;
  osCache = (window._firstLine || '').split(',')[0].toUpperCase();
  return osCache;
}

/** Clears the OS cache. Call when a new file is loaded (mirrors legacy's per-page-load semantics). */
export function resetOsCache() {
  osCache = null;
}

/** Legacy `getHostname()`. */
export function getHostname(): string {
  const firstLine = window._firstLine || '';
  const parts = firstLine.split(',');
  switch (getOS()) {
    case 'LINUX':
      return (parts[2] || '').replace(/\(/g, '').replace(/\)/g, '');
    case 'AIX':
    case 'SUNOS':
      return (parts[1] || '').replace(/\(/g, '').replace(/\)/g, '');
    default:
      return '';
  }
}

/** Legacy `getKernel()`. */
export function getKernel(): string {
  const firstLine = window._firstLine || '';
  const parts = firstLine.split(',');
  switch (getOS()) {
    case 'LINUX': return parts[1] || '';
    case 'AIX': return parts[4] || '';
    case 'SUNOS': return parts[3] || '';
    default: return 'Unknown';
  }
}

/**
 * Legacy `getServerInfo()`. The legacy version wrote a summary into
 * `.homeContainer`, an element removed in the v2 template (file-info-bar +
 * LandingBridge's `populateFileInfo` replaced it). Kept as a no-op call
 * target so `window.getServerInfo?.()` call sites stay valid.
 */
export function getServerInfo() {
  // Intentionally empty — see doc comment above.
}

/** Legacy `grepHeaders(pattern)`. Returns -1 (not null) to match the original contract exactly. */
export function grepHeaders(pattern: string): string | -1 {
  const headers = window.headers || [];
  const match = headers.find((header) => header.includes(pattern));
  return match ?? -1;
}

/**
 * Legacy `displayTitle(title)`.
 *
 * Prefers the global `window.chartPage` when present so the caller gets the
 * `legacyUi` fast-path wrapper (which avoids the footer-flash on CPU-core
 * switches); falls back to the raw local `chartPage` when the global has not
 * been installed (e.g. in isolation/tests). This lets `ChartRouterBridge`
 * share this one implementation instead of keeping its own copy.
 */
export function displayTitle(title: string) {
  (window.chartPage ?? chartPage)();
  const hostname = getHostname();
  const pageTitle = document.getElementById('pageTitle');
  if (pageTitle) pageTitle.textContent = `${title} for ${hostname}`;
}
