const CHUNK_SIZE = 200000;

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

export type SarParseProgress = {
  percent: number;
  line: number;
  totalLines: number;
};

function dateKey(value: string) {
  const parts = value.split('/');
  if (parts.length !== 3) return 0;
  return Number(parts[2]) * 10000 + Number(parts[0]) * 100 + Number(parts[1]);
}

function nextFrame() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

export async function parseSarTextChunked(
  text: string,
  options: { onProgress?: (progress: SarParseProgress) => void } = {}
): Promise<SarParseResult> {
  const lines = text.split('\n');
  const totalLines = lines.length;
  const headers: string[] = [];
  const headersSet: Record<string, 1> = {};
  const index: Record<string, string[]> = {};
  const datesSet: Record<string, 1> = {};
  const dates: string[] = [];
  const wsRx = /\s+/g;
  const numRx = /^[\d.+-]+$/;

  // Only the first server-identity line is ever needed downstream (getOS/
  // getHostname/getKernel read it). The old code pushed every line into a
  // `cachedLines` array just to read `cachedLines[0]`; capturing it once here
  // avoids millions of array pushes + reallocations on large files.
  let firstLine = '';

  let sarDate = '';
  let sectionKey = '';
  let sectionPrefix = '';
  let inSpecialSection = false;

  for (let currentLine = 0; currentLine < totalLines;) {
    const end = Math.min(currentLine + CHUNK_SIZE, totalLines);

    for (let lineNumber = currentLine; lineNumber < end; lineNumber += 1) {
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

    currentLine = end;
    options.onProgress?.({
      percent: Math.round((currentLine / totalLines) * 100),
      line: currentLine,
      totalLines
    });
    if (currentLine < totalLines) await nextFrame();
  }

  dates.sort((a, b) => dateKey(a) - dateKey(b));

  // `index` and `fullIndex` share the same object: the section row arrays are
  // never mutated in place (the date filter in sarStore builds new arrays, and
  // every consumer in sarData/cpuIndex only reads them), so the old defensive
  // `.slice()` copy was pure overhead — a duplicate set of pointer arrays plus
  // an O(rows) copy at the end of every parse.
  return {
    firstLine: firstLine.replace(/user/g, 'usr'),
    headers,
    index,
    fullIndex: index,
    dates
  };
}

