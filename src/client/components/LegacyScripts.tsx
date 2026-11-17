import { useEffect } from 'preact/hooks';
import { assetPath } from '../asset-path';

// Vendored browser libraries loaded after mount, each pinned with a
// Subresource Integrity (SRI) sha384 hash so a tampered/substituted file is
// rejected by the browser. Regenerate a hash after replacing a file with:
//   openssl dgst -sha384 -binary <file> | openssl base64 -A
// (the `?v=` cache-buster on plotly-charts does not affect the file bytes).
type LegacyScript = { src: string; integrity: string };

const legacyScripts: LegacyScript[] = [
  { src: 'js/plotly-cartesian-3.7.0.min.js', integrity: 'sha384-bZyw96TJNxAYROKQ6Js+sdba9eOCs2wvFMevzzEC0+g30MXHiX/nh7wfW8Kahmcf' },
  { src: 'js/plotly-charts.js?v=26', integrity: 'sha384-TRJGxNlwOaCKSXpMp4GxiPx1xIpKmQlOlE+O7d04zBlBE16fxe4GqmxOj9RPi4rG' },
  { src: 'js/html2canvas.min.js', integrity: 'sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H' },
  { src: 'js/jspdf.umd.min.js', integrity: 'sha384-en/ztfPSRkGfME4KIm05joYXynqzUgbsG5nMrj/xEFAHXkeZfO3yMK8QQ+mP7p1/' }
];

function loadScript({ src, integrity }: LegacyScript) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[data-sarkart-legacy="${src}"]`)) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = assetPath(src);
    script.integrity = integrity;
    // Required for the integrity check; same-origin so no CORS round-trip.
    script.crossOrigin = 'anonymous';
    script.dataset.sarkartLegacy = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}

export function LegacyScripts() {
  useEffect(() => {
    let cancelled = false;

    legacyScripts.reduce((chain, entry) => {
      return chain.then(() => {
        if (cancelled) return undefined;
        return loadScript(entry);
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
