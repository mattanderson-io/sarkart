import { useEffect } from 'preact/hooks';
import { installLegacyUi } from '../lib/legacyUi';

/**
 * Retires the last legacy browser script (`public/js/sarkart-ui.js`) by owning
 * its remaining un-guarded behaviors in Preact: progress stage/rate, the
 * `chartPage()` fast path, keyboard shortcuts, sidebar collapse (toggle + body
 * mirror), empty section-label hiding, the per-CPU chip bar, and the
 * `is-dashboard` body state. See `lib/legacyUi.ts` for details.
 *
 * Must mount after `CoreEngineBridge` so the `window.updateProgress` /
 * `window.chartPage` globals it wraps already exist — the ordering in
 * `App.tsx` guarantees this.
 */
export function UiBridge() {
  useEffect(() => {
    return installLegacyUi();
  }, []);

  return null;
}
