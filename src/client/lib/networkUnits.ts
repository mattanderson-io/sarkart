const storageKey = 'sarkart.netUnit';
export const defaultNetworkUnit = 'Mbps';

export const networkUnits = {
  Auto: { kind: 'auto', factor: null, suffix: '' },
  'KB/s': { kind: 'fixed', factor: 1, suffix: 'KB/s' },
  'MB/s': { kind: 'fixed', factor: 1024 / 1e6, suffix: 'MB/s' },
  Mbps: { kind: 'fixed', factor: 8192 / 1e6, suffix: 'Mbps' },
  Gbps: { kind: 'fixed', factor: 8192 / 1e9, suffix: 'Gbps' },
  '% of 1 Gbps': { kind: 'pct', factor: 8192 / 1e9 * 100, suffix: '%' },
  '% of 10 Gbps': { kind: 'pct', factor: 8192 / 10e9 * 100, suffix: '%' },
  '% of 25 Gbps': { kind: 'pct', factor: 8192 / 25e9 * 100, suffix: '%' },
  '% of 40 Gbps': { kind: 'pct', factor: 8192 / 40e9 * 100, suffix: '%' },
  '% of 100 Gbps': { kind: 'pct', factor: 8192 / 100e9 * 100, suffix: '%' }
} as const;

export type NetworkUnitName = keyof typeof networkUnits;

export const networkUnitOrder = Object.keys(networkUnits) as NetworkUnitName[];

export function getNetworkUnit(): NetworkUnitName {
  try {
    const value = localStorage.getItem(storageKey);
    return value && value in networkUnits ? value as NetworkUnitName : defaultNetworkUnit;
  } catch (_error) {
    return defaultNetworkUnit;
  }
}

export function setNetworkUnit(name: NetworkUnitName) {
  try { localStorage.setItem(storageKey, name); } catch (_error) {}
  window.dispatchEvent(new CustomEvent('sarkart-network-unit-change', { detail: { unit: name } }));
}

export function pickAutoUnit(peakKBs: number): NetworkUnitName {
  if (!Number.isFinite(peakKBs) || peakKBs <= 0) return 'Mbps';
  const asMbps = peakKBs * networkUnits.Mbps.factor;
  if (asMbps >= 800) return 'Gbps';
  if (asMbps >= 1) return 'Mbps';
  if (peakKBs >= 1000) return 'MB/s';
  return 'KB/s';
}

export function findSeriesPeak(series: LegacySeries[]) {
  let peak = 0;
  series.forEach((item) => {
    (item.data || []).forEach((point) => {
      const value = point?.[1];
      if (typeof value === 'number' && Number.isFinite(value) && value > peak) peak = value;
    });
  });
  return peak;
}

export function resolveNetworkUnit(name: NetworkUnitName, peakKBs: number) {
  const resolvedName = name === 'Auto' ? pickAutoUnit(peakKBs) : name;
  const unit = networkUnits[resolvedName];
  return { name: resolvedName, factor: unit.factor || 1, suffix: unit.suffix };
}

export function convertKBs(kbs: number) {
  const resolved = resolveNetworkUnit(getNetworkUnit(), kbs);
  return { value: kbs * resolved.factor, suffix: resolved.suffix };
}

export function convertSeries(series: LegacySeries[], factor: number) {
  return series.map((item) => ({
    name: item.name,
    data: (item.data || []).map((point) => {
      const value = point?.[1];
      return typeof value === 'number' && Number.isFinite(value)
        ? [point[0], value * factor] as LegacyPoint
        : [point?.[0] || 0, value] as LegacyPoint;
    })
  }));
}

export function relabelSeries(name: string | undefined, suffix: string) {
  if (!name) return name;
  return name
    .replace(/\b(?:rxkB\/s|txkB\/s|kB\/s|kilobytes per second)\b/gi, suffix)
    .replace(/^Total number of kilobytes\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function relabelAxisTitle(title: string, suffix: string) {
  return title
    .replace(/\b(?:rxkB\/s|txkB\/s|kB\/s)\b/gi, suffix)
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function looksLikeNetworkBytesChart(yAxisTitle: string, series: LegacySeries[]) {
  const haystack = `${yAxisTitle || ''}|${series.map((item) => item.name || '').join('|')}`;
  return /\brx?kB\/?s\b|\btx?kB\/?s\b|\bkilobytes\b/i.test(haystack);
}
