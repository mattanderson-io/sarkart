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
 * (Historically these were installed both on mount AND again on a
 * `sarkart:legacy-engine-loaded` event, because sarkart-v1.0.0.min.js
 * defined the same names as plain global `function` statements and would
 * clobber our versions when it loaded late. That engine has since been
 * deleted, so a single install on mount is enough. sarkart-ui.js's
 * `wrapUpdateProgress`/`wrapChartPage` still wrap whatever
 * window.updateProgress/chartPage exist when it loads — now always ours.)
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
    // The legacy engine (sarkart-v1.0.0.min.js) that used to define — and
    // clobber — these globals has been removed, so a single install on
    // mount is sufficient; there's no longer a late-loading script to
    // re-assert against.
    install();
  }, []);

  return null;
}
