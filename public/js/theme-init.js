// Anti-FOUC theme setter: applies the persisted theme to <html> before the
// stylesheet renders. Loaded as a blocking <script src> in <head> (not inline)
// so the page stays Content-Security-Policy strict (script-src 'self') without
// needing an inline-script hash or 'unsafe-inline'.
(function () {
  var m = document.cookie.match(/(?:^|;\s*)sarkart-theme=(light|dark)(?:;|$)/);
  var theme = m ? m[1] : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
})();
