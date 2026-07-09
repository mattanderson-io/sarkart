/**
 * Self-contained, synchronous SAR parsing core used by the worker-parallel
 * path (bench/parallel-bench.mjs + bench/joinedWorker.mjs).
 *
 * IMPORTANT — why this is a near-verbatim COPY of parseSarTextChunked's hot
 * loop rather than a shared/extracted helper:
 *
 *   A previous attempt factored the per-line body of the parser into its own
 *   `processLine()` function so the single-threaded parser and the workers
 *   could share it. That extraction regressed the 500 MB single-threaded parse
 *   from ~2.5 s to ~6.7 s (and ~2x memory) because pulling the hot loop out of
 *   its enclosing function defeats V8's optimization of that tight local loop.
 *
 * So the rule here is: keep the loop MONOLITHIC and INLINE. This module
 * duplicates the loop for the worker/byte path instead of sharing it. The
 * duplication is deliberate; do not "DRY" it back into sarParser.ts.
 *
 * `parseBytes` decodes a Uint8Array chunk to a string (each chunk / each
 * <512 MB file stays under the V8 max-string ceiling) and runs the inline
 * loop. Workers receive a transferred ArrayBuffer (zero-copy) and decode +
 * parse locally, so only the compact result is structure-cloned back.
 */

const headerKeys: Record<string, 1> = {
  '%usr': 1,
  device: 1,
  'bread/s': 1,
  'swpin/s': 1,
  'iget/s': 1,
  'rawch/s': 1,
  'proc-sz': 1,
  'msg/s': 1,
  'atch/s': 1,
  'pgout/s': 1,
  freemem: 1,
  sml_mem: 1,
  CPU: 1,
  'proc/s': 1,
  'pswpin/s': 1,
  'pgpgin/s': 1,
  tps: 1,
  'frmpg/s': 1,
  kbmemfree: 1,
  kbswpfree: 1,
  kbhugfree: 1,
  dentunusd: 1,
  'runq-sz': 1,
  DEV: 1,
  IFACE: 1,
  'call/s': 1,
  'scall/s': 1,
  totsck: 1,
  TTY: 1,
  INTR: 1,
  slots: 1
};

export type SarParseResult = {
  firstLine: string;
  headers: string[];
  index: Record<string, string[]>;
  fullIndex: Record<string, string[]>;
  dates: string[];
};

function dateKey(value: string) {
  const parts = value.split('/');
  if (parts.length !== 3) return 0;
  return Number(parts[2]) * 10000 + Number(parts[0]) * 100 + Number(parts[1]);
}

/**
 * Synchronous, monolithic parse of an already-decoded SAR text string.
 * Byte-for-byte identical semantics to parseSarTextChunked, minus the
 * async chunk-yield / progress plumbing (irrelevant off the main thread).
 */
export function parseText(text: string): SarParseResult {
  const lines = text.split('\n');
  const totalLines = lines.length;
  const headers: string[] = [];
  const headersSet: Record<string, 1> = {};
  const index: Record<string, string[]> = {};
  const datesSet: Record<string, 1> = {};
  const dates: string[] = [];
  const wsRx = /\s+/g;
  const numRx = /^[\d.+-]+$/;

  let firstLine = '';
  let sarDate = '';
  let sectionKey = '';
  let sectionPrefix = '';
  let inSpecialSection = false;

  for (let lineNumber = 0; lineNumber < totalLines; lineNumber += 1) {
    const line = lines[lineNumber];
    if (!line) {
      inSpecialSection = false;
      continue;
    }

    const firstChar = line.charCodeAt(0);

    if (firstChar === 65) {
      if (line.charCodeAt(1) === 118) {
        inSpecialSection = false;
        continue;
      }
      if (line.charCodeAt(1) === 73) {
        const parts = line.split(wsRx);
        sarDate = parts[5];
        sectionPrefix = '';
        sectionKey = '';
        if (!firstLine) firstLine = line.replace(wsRx, ',');
        inSpecialSection = false;
        continue;
      }
      continue;
    }

    if (firstChar === 76 && line.charCodeAt(1) === 105) {
      const parts = line.split(wsRx);
      sarDate = parts[3];
      sectionPrefix = '';
      sectionKey = '';
      if (!firstLine) firstLine = line.replace(wsRx, ',');
      inSpecialSection = false;
      continue;
    }

    if (firstChar === 83) {
      if (line.charCodeAt(1) === 117) {
        const parts = line.split(wsRx);
        sarDate = parts[5];
        sectionPrefix = '';
        sectionKey = '';
        if (!firstLine) firstLine = line.replace(wsRx, ',');
        inSpecialSection = false;
      }
      continue;
    }

    if (firstChar < 48 || firstChar > 57) continue;

    const sp1 = line.indexOf(' ');
    if (sp1 === -1) continue;

    let tokenStart = sp1 + 1;
    while (tokenStart < line.length && line.charCodeAt(tokenStart) === 32) tokenStart += 1;

    let tokenEnd = tokenStart;
    while (tokenEnd < line.length && line.charCodeAt(tokenEnd) !== 32 && line.charCodeAt(tokenEnd) !== 9) tokenEnd += 1;

    const token1 = line.substring(tokenStart, tokenEnd);

    let lastEnd = line.length - 1;
    while (lastEnd > 0 && (line.charCodeAt(lastEnd) === 32 || line.charCodeAt(lastEnd) === 9)) lastEnd -= 1;

    let lastStart = lastEnd;
    while (lastStart > 0 && line.charCodeAt(lastStart - 1) !== 32 && line.charCodeAt(lastStart - 1) !== 9) lastStart -= 1;

    const lastToken = line.substring(lastStart, lastEnd + 1);

    if ((lastToken === 'IFACE' || lastToken === 'DEV') && tokenStart < lastStart) {
      const parts = line.split(wsRx);
      parts.pop();
      parts.splice(1, 0, lastToken);
      sectionKey = `${lastToken}-${parts[2]}`;
      sectionPrefix = `${sectionKey},`;
      const header = parts.slice(1).join(',');
      if (!headersSet[header]) {
        headersSet[header] = 1;
        headers.push(header);
      }
      inSpecialSection = true;
      continue;
    }

    if (token1 === 'AM' || token1 === 'PM') {
      const parts = line.split(wsRx);
      if (headerKeys[parts[2]]) {
        sectionKey = `${parts[2]}-${parts[3]}`;
        sectionPrefix = `${sectionKey},`;
        const header = parts.slice(2).join(',');
        if (!headersSet[header]) {
          headersSet[header] = 1;
          headers.push(header);
        }
        inSpecialSection = false;
        continue;
      }
    } else if (headerKeys[token1]) {
      const parts = line.split(wsRx);
      sectionKey = `${token1}-${parts[2]}`;
      sectionPrefix = `${sectionKey},`;
      const header = parts.slice(1).join(',');
      if (!headersSet[header]) {
        headersSet[header] = 1;
        headers.push(header);
      }
      inSpecialSection = false;
      continue;
    }

    let csvLine: string;
    if (inSpecialSection && !numRx.test(lastToken)) {
      const parts = line.split(wsRx);
      parts.pop();
      parts.splice(1, 0, lastToken);
      csvLine = `${sectionPrefix}${sarDate}|${parts.join(',')}`;
    } else {
      csvLine = `${sectionPrefix}${sarDate}|${line.replace(wsRx, ',')}`;
    }

    index[sectionKey] ||= [];
    index[sectionKey].push(csvLine);

    const dateStart = sectionKey.length + 1;
    const dateEnd = csvLine.indexOf('|', dateStart);
    if (dateEnd > -1) {
      const date = csvLine.substring(dateStart, dateEnd);
      if (!datesSet[date]) {
        datesSet[date] = 1;
        dates.push(date);
      }
    }
  }

  dates.sort((a, b) => dateKey(a) - dateKey(b));

  return {
    firstLine: firstLine.replace(/user/g, 'usr'),
    headers,
    index,
    fullIndex: index,
    dates
  };
}

const decoder = new TextDecoder('utf-8');

/** Decode a byte chunk and parse it. Each chunk stays under the string ceiling. */
export function parseBytes(bytes: Uint8Array): SarParseResult {
  return parseText(decoder.decode(bytes));
}

/**
 * The result each worker returns: every section's rows pre-joined into ONE
 * string ('\n'-separated) plus a row count. This is the ONLY marshaling the
 * worker/parallel path uses — returning ~18 big strings instead of millions of
 * tiny ones keeps the worker->main structured clone cheap and, crucially, flat
 * as files grow (the old per-row-array marshaling fell off a memory-pressure
 * cliff past ~1 GiB — millions of cloned strings → GC thrash that worsened with
 * worker count; ~17 s vs ~5 s at 1.6 GB). It also lines up with sarStore's
 * packed one-string-per-section layout.
 */
export type SarJoinedResult = {
  firstLine: string;
  headers: string[];
  joined: Record<string, string>;
  counts: Record<string, number>;
  dates: string[];
};

export function parseBytesJoined(bytes: Uint8Array): SarJoinedResult {
  const r = parseText(decoder.decode(bytes));
  const joined: Record<string, string> = {};
  const counts: Record<string, number> = {};
  for (const key in r.index) {
    const rows = r.index[key];
    counts[key] = rows.length;
    joined[key] = rows.join('\n');
  }
  return { firstLine: r.firstLine, headers: r.headers, joined, counts, dates: r.dates };
}

/** Merge joined partials: concatenate each section's joined blob in chunk order. */
export function mergeJoined(partials: SarJoinedResult[]): SarJoinedResult {
  if (partials.length === 1) return partials[0];

  const headers: string[] = [];
  const headersSet: Record<string, 1> = {};
  const joinedParts: Record<string, string[]> = {};
  const counts: Record<string, number> = {};
  const dates: string[] = [];
  const datesSet: Record<string, 1> = {};
  let firstLine = '';

  for (const p of partials) {
    if (!firstLine && p.firstLine) firstLine = p.firstLine;
    for (const h of p.headers) {
      if (!headersSet[h]) { headersSet[h] = 1; headers.push(h); }
    }
    for (const key in p.joined) {
      (joinedParts[key] ||= []).push(p.joined[key]);
      counts[key] = (counts[key] || 0) + p.counts[key];
    }
    for (const d of p.dates) {
      if (!datesSet[d]) { datesSet[d] = 1; dates.push(d); }
    }
  }

  const joined: Record<string, string> = {};
  for (const key in joinedParts) joined[key] = joinedParts[key].join('\n');

  dates.sort((a, b) => {
    const ka = a.split('/');
    const kb = b.split('/');
    const na = ka.length === 3 ? Number(ka[2]) * 10000 + Number(ka[0]) * 100 + Number(ka[1]) : 0;
    const nb = kb.length === 3 ? Number(kb[2]) * 10000 + Number(kb[0]) * 100 + Number(kb[1]) : 0;
    return na - nb;
  });

  return { firstLine, headers, joined, counts, dates };
}

const MiB = 1024 ** 2;

/**
 * Worker count as a function of raw file size — the canonical parallel policy
 * (shared by the bench and, when wired up, the real upload path).
 *
 * Tuned from the worker-count x size sweep:
 *
 *     size <  256 MiB -> 4 workers   (short parse; spawn overhead not worth 6)
 *     size >= 256 MiB -> 6 workers   (6 beats 4 from ~500 MB up; crossover
 *                                     sits between 100 and 500 MB)
 *
 * 8 workers was dropped: it never reliably wins and REGRESSES on very large
 * files (e.g. 1.6 GB was slower at 8 than 6), because more workers means more
 * simultaneous result payloads on the main heap. 6 is the robust sweet spot
 * across the whole 0.5–1.6 GB range.
 */
export function workersForSize(sizeBytes: number): number {
  return sizeBytes < 256 * MiB ? 4 : 6;
}

const LF = 10; // '\n'

/**
 * Is the line beginning at `pos` a server-identity line (a safe split point)?
 * Synthetic + real SAR files start each capture block with one of these.
 *   Linux -> 'L''i'   |  AIX -> 'A''I'   |  SunOS -> 'S''u'
 */
function isIdentityStart(bytes: Uint8Array, pos: number) {
  const c0 = bytes[pos];
  const c1 = bytes[pos + 1];
  return (
    (c0 === 76 && c1 === 105) || // "Li" (Linux)
    (c0 === 65 && c1 === 73) ||  // "AI" (AIX-style)
    (c0 === 83 && c1 === 117)    // "Su" (SunOS)
  );
}

/**
 * Compute [0, s1, s2, ..., len] split offsets so the buffer divides into ~n
 * chunks, each cut at the START of an identity line. Because every capture
 * block carries its own section headers, a chunk of whole blocks parses
 * independently and merges cleanly. Returns fewer boundaries than requested
 * when the file has too few identity lines to split.
 */
export function findSplitOffsets(bytes: Uint8Array, nWorkers: number): number[] {
  const len = bytes.length;
  if (nWorkers <= 1 || len === 0) return [0, len];

  const offsets = [0];
  for (let k = 1; k < nWorkers; k += 1) {
    let pos = Math.floor((len * k) / nWorkers);
    // Back up to a line start is unnecessary; walk forward to the next newline,
    // then forward until a line begins with an identity marker.
    while (pos < len && bytes[pos] !== LF) pos += 1;
    pos += 1; // step past the newline -> start of a line
    while (pos < len) {
      if (isIdentityStart(bytes, pos)) break;
      while (pos < len && bytes[pos] !== LF) pos += 1;
      pos += 1;
    }
    if (pos < len && pos > offsets[offsets.length - 1]) offsets.push(pos);
  }
  offsets.push(len);
  return offsets;
}
