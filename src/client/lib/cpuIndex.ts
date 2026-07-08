/**
 * Per-core CPU index builder.
 *
 * `getCPU()` (in `sarData.ts`) reads the per-core index
 * (`sarStore.getCpuByCore()`) — a map of CPU core id ("all", "0", "1", …) to
 * the raw `CPU-%usr` rows for that core. This module builds that map from a
 * flat list of `CPU-%usr` rows.
 *
 * Extracted from `SarDataBridge` so it can be unit-tested directly (it is the
 * "re-index" half of the date-filter → re-index → per-core-chart flow). The
 * build is chunked with a yield between chunks so a many-core / multi-day file
 * doesn't produce one long task that blocks the UI — the same behavior the
 * dashboard bootstrap and date-filter refresh rely on.
 */

const DEFAULT_CHUNK = 10000;

function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export type CpuByCore = {
  /** Core ids in natural sort order (numeric cores ascending, then "all"). */
  ids: string[];
  /** Core id → the `CPU-%usr` rows for that core, in file order. */
  byCore: Record<string, string[]>;
};

/**
 * Group `CPU-%usr` rows by core id. Core ids preserve first-seen insertion for
 * `byCore` and are returned naturally sorted in `ids`. Yields to the event loop
 * every `chunkSize` rows so large inputs stay responsive.
 */
export async function buildCpuByCore(
  lines: string[],
  options: { chunkSize?: number } = {}
): Promise<CpuByCore> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK;
  const ids: string[] = [];
  const seen: Record<string, 1> = {};
  const byCore: Record<string, string[]> = {};

  for (let index = 0; index < lines.length;) {
    const end = Math.min(index + chunkSize, lines.length);
    for (let i = index; i < end; i += 1) {
      const id = lines[i].split(',')[2];
      if (id === undefined) continue;
      if (!seen[id]) {
        seen[id] = 1;
        ids.push(id);
      }
      (byCore[id] ||= []).push(lines[i]);
    }
    index = end;
    if (index < lines.length) await nextTick();
  }

  ids.sort(naturalCompare);
  return { ids, byCore };
}
