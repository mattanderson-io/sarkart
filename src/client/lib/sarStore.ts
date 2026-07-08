import type { SarParseResult } from './sarParser';

export type SarDataState = {
  parsed: SarParseResult | null;
  activeIndex: Record<string, string[]>;
  selectedDates: string[] | null;
};

const state: SarDataState = {
  parsed: null,
  activeIndex: {},
  selectedDates: null
};

const listeners = new Set<(state: SarDataState) => void>();

function notify() {
  const snapshot = getSarDataState();
  listeners.forEach((listener) => listener(snapshot));
  window.dispatchEvent(new CustomEvent('sarkart:data', { detail: snapshot }));
}

export function getSarDataState(): SarDataState {
  return {
    parsed: state.parsed,
    activeIndex: state.activeIndex,
    selectedDates: state.selectedDates ? state.selectedDates.slice() : null
  };
}

export function subscribeSarData(listener: (state: SarDataState) => void) {
  listeners.add(listener);
  listener(getSarDataState());
  return () => listeners.delete(listener);
}

export function setSarData(parsed: SarParseResult) {
  state.parsed = parsed;
  state.activeIndex = parsed.index;
  state.selectedDates = null;
  mirrorToLegacyGlobals();
  notify();
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

  mirrorToLegacyGlobals();
  notify();
}

export function mirrorToLegacyGlobals() {
  if (!state.parsed) return;
  window._firstLine = state.parsed.firstLine;
  window.headers = state.parsed.headers;
  window._idx = state.activeIndex;
  window._fullIdx = state.parsed.fullIndex;
  window._allDatesArr = state.parsed.dates;
  window._filterByDates = filterSarDataByDates;
}

