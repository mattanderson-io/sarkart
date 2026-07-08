import type { SarParseResult } from './sarParser';

type SarDataState = {
  parsed: SarParseResult | null;
  activeIndex: Record<string, string[]>;
  selectedDates: string[] | null;
  cpuByCore: Record<string, string[]>;
};

const state: SarDataState = {
  parsed: null,
  activeIndex: {},
  selectedDates: null,
  cpuByCore: {}
};

export function setSarData(parsed: SarParseResult) {
  state.parsed = parsed;
  state.activeIndex = parsed.index;
  state.selectedDates = null;
  state.cpuByCore = {};
}

export function filterSarDataByDates(dates: string[] | null) {
  if (!state.parsed) return;
  state.selectedDates = dates ? dates.slice() : null;

  if (!dates) {
    state.activeIndex = state.parsed.fullIndex;
  } else {
    const selected = new Set(dates);
    const filtered: Record<string, string[]> = {};
    Object.keys(state.parsed.fullIndex).forEach((key) => {
      filtered[key] = state.parsed?.fullIndex[key].filter((line) => {
        const comma = line.indexOf(',');
        const pipe = line.indexOf('|', comma);
        if (comma === -1 || pipe === -1) return true;
        return selected.has(line.substring(comma + 1, pipe));
      }) || [];
    });
    state.activeIndex = filtered;
  }
}

// -- Accessors (single source of truth; formerly mirrored onto window.*) ------

/** Whether a SAR file has been parsed and stored. */
export function hasData() {
  return state.parsed !== null;
}

/** The active (date-filtered) section index. */
export function getActiveIndex() {
  return state.activeIndex;
}

/** Rows for a single section key from the active index. */
export function getRows(key: string) {
  return state.activeIndex[key] || [];
}

/** The unfiltered section index. */
export function getFullIndex() {
  return state.parsed?.fullIndex || {};
}

/** Parsed section header lines. */
export function getHeaders() {
  return state.parsed?.headers || [];
}

/** The SAR file's first (server-identity) line. */
export function getFirstLine() {
  return state.parsed?.firstLine || '';
}

/** All dates present in the file, chronologically sorted. */
export function getDates() {
  return state.parsed?.dates || [];
}

/** The derived per-core CPU row index that `getCPU` reads. */
export function getCpuByCore() {
  return state.cpuByCore;
}

/** Publish a rebuilt per-core CPU index (see cpuIndex.buildCpuByCore). */
export function setCpuByCore(byCore: Record<string, string[]>) {
  state.cpuByCore = byCore;
}
