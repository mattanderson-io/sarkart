import type { SarParseResult } from './sarParser';

/**
 * Packed section storage.
 *
 * The parser hands us each section as `string[]` (one small csvLine per row).
 * Retaining millions of tiny strings is expensive: each carries ~16–24 bytes
 * of V8 object header on top of its content, so a 500 MB file retained ~1.08×
 * its size. Instead we concatenate every row of a section into ONE big string
 * plus a `Uint32Array` of row start offsets. That collapses millions of string
 * headers into ~one-per-section, dropping retained memory to ~0.78× the file
 * while keeping the exact same row text available on demand.
 *
 * `getRows()` reconstructs the row strings as V8 SlicedStrings (they share the
 * packed string's character data — no content copy), so every existing
 * consumer keeps working with `string[]` exactly as before.
 */
type PackedSection = { text: string; offsets: Uint32Array };
type PackedIndex = Record<string, PackedSection>;

type SarDataState = {
  loaded: boolean;
  firstLine: string;
  headers: string[];
  dates: string[];
  fullIndex: PackedIndex;
  activeIndex: PackedIndex;
  selectedDates: string[] | null;
  cpuByCore: Record<string, string[]>;
  /**
   * Bumped whenever the underlying data a chart accessor reads changes
   * (load, date filter, per-core reindex). `sarData`'s column cache watches
   * this to know when to discard its parsed columns.
   */
  generation: number;
};

const state: SarDataState = {
  loaded: false,
  firstLine: '',
  headers: [],
  dates: [],
  fullIndex: {},
  activeIndex: {},
  selectedDates: null,
  cpuByCore: {},
  generation: 0
};

const EMPTY: string[] = [];

/** Concatenate a section's rows into one string + row start offsets. */
function pack(rows: string[]): PackedSection {
  const n = rows.length;
  const offsets = new Uint32Array(n + 1);
  let pos = 0;
  for (let i = 0; i < n; i += 1) {
    offsets[i] = pos;
    pos += rows[i].length;
  }
  offsets[n] = pos;
  const text = rows.join('');
  // `Array.join` can hand back a ConsString (a rope) that keeps every original
  // row string alive as a leaf — which would defeat the whole point. Force V8
  // to flatten it into a single contiguous SeqString so the source rows become
  // collectable. `indexOf` scans the string, which requires a flat backing store.
  if (text.length > 0) text.indexOf('\n');
  return { text, offsets };
}

/** Expand a packed section back into per-row strings (SlicedStrings). */
function unpack(section: PackedSection | undefined): string[] {
  if (!section) return EMPTY;
  const { text, offsets } = section;
  const n = offsets.length - 1;
  const rows = new Array<string>(n);
  for (let i = 0; i < n; i += 1) rows[i] = text.slice(offsets[i], offsets[i + 1]);
  return rows;
}

function packIndex(index: Record<string, string[]>): PackedIndex {
  const packed: PackedIndex = {};
  for (const key of Object.keys(index)) packed[key] = pack(index[key]);
  return packed;
}

export function setSarData(parsed: SarParseResult) {
  state.loaded = true;
  state.firstLine = parsed.firstLine;
  state.headers = parsed.headers;
  state.dates = parsed.dates;
  // Pack the parser's per-row strings; once this returns the caller's `parsed`
  // (and its string[] arrays) becomes collectable, leaving only the packed form.
  state.fullIndex = packIndex(parsed.index);
  state.activeIndex = state.fullIndex;
  state.selectedDates = null;
  state.cpuByCore = {};
  state.generation += 1;
}

export function filterSarDataByDates(dates: string[] | null) {
  if (!state.loaded) return;
  state.selectedDates = dates ? dates.slice() : null;
  state.generation += 1;

  if (!dates) {
    state.activeIndex = state.fullIndex;
    return;
  }

  const selected = new Set(dates);
  const filtered: PackedIndex = {};
  for (const key of Object.keys(state.fullIndex)) {
    const rows = unpack(state.fullIndex[key]);
    const kept = rows.filter((line) => {
      const comma = line.indexOf(',');
      const pipe = line.indexOf('|', comma);
      if (comma === -1 || pipe === -1) return true;
      return selected.has(line.substring(comma + 1, pipe));
    });
    filtered[key] = pack(kept);
  }
  state.activeIndex = filtered;
}

// -- Accessors (single source of truth; formerly mirrored onto window.*) ------

/** Whether a SAR file has been parsed and stored. */
export function hasData() {
  return state.loaded;
}

/** The active (date-filtered) section index — keyed by section, packed values. */
export function getActiveIndex() {
  return state.activeIndex;
}

/** Rows for a single section key from the active index. */
export function getRows(key: string) {
  return unpack(state.activeIndex[key]);
}

/** The unfiltered section index (packed). */
export function getFullIndex() {
  return state.fullIndex;
}

/** Parsed section header lines. */
export function getHeaders() {
  return state.headers;
}

/** The SAR file's first (server-identity) line. */
export function getFirstLine() {
  return state.firstLine;
}

/** All dates present in the file, chronologically sorted. */
export function getDates() {
  return state.dates;
}

/** The derived per-core CPU row index that `getCPU` reads. */
export function getCpuByCore() {
  return state.cpuByCore;
}

/** Publish a rebuilt per-core CPU index (see cpuIndex.buildCpuByCore). */
export function setCpuByCore(byCore: Record<string, string[]>) {
  state.cpuByCore = byCore;
  state.generation += 1;
}

/**
 * Monotonic data-generation counter. Increments on every load, date-filter
 * change, and per-core reindex so caches (see `sarData`) can invalidate.
 */
export function getGeneration() {
  return state.generation;
}
