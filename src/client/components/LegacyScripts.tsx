import { useEffect } from 'preact/hooks';

const legacyScripts = [
  '/js/plotly-cartesian-3.7.0.min.js',
  '/js/plotly-charts.js?v=26',
  '/js/html2canvas.min.js',
  '/js/jspdf.umd.min.js'
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

    legacyScripts.reduce((chain, src) => {
      return chain.then(() => {
        if (cancelled) return undefined;
        return loadScript(src);
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
