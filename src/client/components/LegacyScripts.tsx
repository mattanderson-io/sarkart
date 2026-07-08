import { useEffect } from 'preact/hooks';

const legacyScripts = [
  '/js/jquery-4.0.0.min.js',
  '/js/bootstrap.bundle.min.js',
  '/js/plotly-cartesian-3.5.1.min.js',
  '/js/highcharts-shim.js',
  '/js/sarkart-v1.0.0.min.js',
  '/js/plotly-charts.js?v=26',
  '/js/html2canvas.min.js',
  '/js/jspdf.umd.min.js',
  '/js/sarkart-ui.js?v=11'
];

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[data-sarkart-legacy="${src}"]`)) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.dataset.sarkartLegacy = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}

export function LegacyScripts() {
  useEffect(() => {
    let cancelled = false;
    window.__sarkartPreactTopUi = true;

    legacyScripts.reduce((chain, src) => {
      return chain.then(() => {
        if (cancelled) return undefined;
        return loadScript(src).then(() => {
          // `sarkart-v1.0.0.min.js` defines showBlock/getOS/displayTitle/etc.
          // as plain global `function` statements, which silently clobber
          // any window.* overrides CoreEngineBridge/ChartRouterBridge
          // installed at mount time. Fire a signal the instant it finishes
          // loading (and before sarkart-ui.js loads and wraps
          // window.updateProgress/chartPage) so those bridges can
          // re-install their versions on top, exactly once.
          if (src === '/js/sarkart-v1.0.0.min.js') {
            window.dispatchEvent(new Event('sarkart:legacy-engine-loaded'));
          }
        });
      });
    }, Promise.resolve()).catch((error) => {
      console.error('[SARkart] Legacy script load failed:', error);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
