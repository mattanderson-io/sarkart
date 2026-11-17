import { assetPath } from '../asset-path';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <span className="site-footer-brand">
          <img className="site-footer-logo" src={assetPath('images/racing-penguin.webp')} alt="" />
          SARkart
          <span className="site-footer-version">v2.0.0</span>
        </span>
        <span className="site-footer-sep" aria-hidden="true">·</span>
        <span className="site-footer-meta">Built by Matt Anderson</span>
        <span className="site-footer-sep" aria-hidden="true">·</span>
        <span className="site-footer-meta">
          Inspired by{' '}
          <a href="https://github.com/sargraph/sargraph.github.io" target="_blank" rel="noopener">SARchart</a>
        </span>
        <span className="site-footer-sep" aria-hidden="true">·</span>
        <span className="site-footer-meta">
          <a href="https://github.com/mattanderson-io/sarkart" target="_blank" rel="noopener">
            <svg className="icon icon-inline" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" /><path d="M9 18c-4.51 2-5-2-7-2" /></svg>
            GitHub
          </a>
          {' · '}
          <a href="https://github.com/mattanderson-io/sarkart/issues" target="_blank" rel="noopener">
            <svg className="icon icon-inline" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 2 1.88 1.88" /><path d="M14.12 3.88 16 2" /><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" /><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" /><path d="M12 20v-9" /><path d="M6.53 9C4.6 8.8 3 7.1 3 5" /><path d="M6 13H2" /><path d="M3 21c0-2.1 1.7-3.8 3.8-4" /><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" /><path d="M22 13h-4" /><path d="M17.2 17c2.1.2 3.8 1.9 3.8 4" /></svg>
            Report an issue
          </a>
        </span>
        <span className="site-footer-sep" aria-hidden="true">·</span>
        <span className="site-footer-meta">
          <a href="https://www.gnu.org/licenses/gpl-3.0.en.html" target="_blank" rel="noopener">GPLv3</a>
        </span>
      </div>
    </footer>
  );
}
