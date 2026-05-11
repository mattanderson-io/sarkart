/**
 * Highcharts compatibility shim for sarkart-plotly.
 *
 * SARkart's original minified app (sarkart-v1.0.0.min.js) calls two
 * Highcharts APIs at module-load time:
 *
 *   Highcharts.wrap(Highcharts.Chart.prototype, 'getContainer', fn);
 *   Highcharts.setOptions(Highcharts.theme);
 *
 * Plotly replaced Highcharts as the renderer, but rewriting that minified
 * file is invasive. Instead, provide a tiny stub so those calls are harmless
 * no-ops. The remaining Highcharts.* references inside the legacy
 * printChart / printMultiChart / printPieChart function bodies are dead
 * code — plotly-charts.js overrides the three `window.*Chart*` names on
 * DOMContentLoaded, before any SAR button is clicked.
 *
 * This shim MUST load before sarkart-v1.0.0.min.js.
 */
(function () {
  if (window.Highcharts) return; // real Highcharts (or another shim) already loaded
  var noop = function () {};
  var Chart = function () {};
  Chart.prototype = {};
  window.Highcharts = {
    Chart: Chart,
    wrap: noop,
    setOptions: noop
  };
})();
