export function cssVar(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name);
  return (value && value.trim()) || fallback;
}

export function chartTheme() {
  return {
    text: cssVar('--chart-axis', '#67728a'),
    plot: cssVar('--chart-plot-bg', '#10151d'),
    grid: cssVar('--chart-grid', '#1d2532'),
    font: cssVar('--font-ui', 'Inter var, sans-serif')
  };
}
