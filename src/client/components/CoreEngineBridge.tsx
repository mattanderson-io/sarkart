import { useEffect } from 'preact/hooks';
import { chartPage, displayTitle, resetOsCache, updateProgress } from '../lib/sarEngine';

/**
 * Installs the three engine primitives that must remain on `window` because
 * they are *decorated in place*: `legacyUi` wraps `updateProgress` (stage/rate)
 * and `chartPage` (CPU-switch fast path); `LandingBridge` wraps `displayTitle`
 * (strips the host suffix). Callers reach the decorated versions via `window.*`.
 *
 * Every other former engine primitive (showBlock, hideBlock, show, hide,
 * showNotes, progressBarReset, homePage, getOS, getHostname, getKernel,
 * getServerInfo, grepHeaders) is now imported directly from `lib/sarEngine`
 * by its callers — no longer part of the `window.*` bus.
 */
function install() {
  resetOsCache();
  window.updateProgress = updateProgress;
  window.chartPage = chartPage;
  window.displayTitle = displayTitle;
}

export function CoreEngineBridge() {
  useEffect(() => {
    install();
  }, []);

  return null;
}
