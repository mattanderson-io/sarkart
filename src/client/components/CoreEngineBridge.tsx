import { useEffect } from 'preact/hooks';
import {
  chartPage,
  displayTitle,
  getHostname,
  getKernel,
  getOS,
  getServerInfo,
  grepHeaders,
  hide,
  hideBlock,
  homePage,
  progressBarReset,
  resetOsCache,
  show,
  showBlock,
  showNotes,
  updateProgress
} from '../lib/sarEngine';

/**
 * Sub-step 1 of Chunk 2 (retiring the legacy engine): installs the core
 * page-state/UI-primitive functions that `sarkart-v1.0.0.min.js` used to
 * supply — showBlock, hideBlock, show, hide, showNotes, updateProgress,
 * progressBarReset, chartPage, homePage, getOS, getHostname, getKernel,
 * getServerInfo, grepHeaders, displayTitle.
 *
 * Load-order hazard: `sarkart-v1.0.0.min.js` defines these same names as
 * plain global `function` statements. Because LegacyScripts loads that file
 * asynchronously *after* this component's mount effect has already run,
 * the legacy script would silently clobber whatever we install here the
 * moment it finishes loading. `LegacyScripts` fires
 * `sarkart:legacy-engine-loaded` synchronously right after that script
 * resolves (and before the next script in the chain, `sarkart-ui.js`,
 * loads) — we re-install on that event so our versions win, and
 * `sarkart-ui.js`'s `wrapUpdateProgress`/`wrapChartPage` end up wrapping
 * the Preact versions rather than the legacy ones.
 */
function install() {
  resetOsCache();
  window.showBlock = showBlock;
  window.hideBlock = hideBlock;
  window.show = show;
  window.hide = hide;
  window.showNotes = showNotes;
  window.updateProgress = updateProgress;
  window.progressBarReset = progressBarReset;
  window.chartPage = chartPage;
  window.homePage = homePage;
  window.getOS = getOS;
  window.getHostname = getHostname;
  window.getKernel = getKernel;
  window.getServerInfo = getServerInfo;
  window.grepHeaders = grepHeaders;
  window.displayTitle = displayTitle;
}

export function CoreEngineBridge() {
  useEffect(() => {
    install();
    window.addEventListener('sarkart:legacy-engine-loaded', install);
    return () => window.removeEventListener('sarkart:legacy-engine-loaded', install);
  }, []);

  return null;
}
