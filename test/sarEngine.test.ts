/**
 * Unit coverage for the server-identity helpers in `src/client/lib/sarEngine.ts`
 * — `getOS`, `getHostname`, `getKernel`, `grepHeaders`. SARkart is Linux-only:
 * `getHostname`/`getKernel` read the Linux SAR header positions, and `getOS`
 * still detects the OS token so a non-Linux file can be rejected with a clear
 * notice (see SarDataBridge's `showUnsupportedOs`).
 *
 * Runs on Node's built-in test runner with native TypeScript type-stripping
 * (no extra dependencies): `npm test`. The helpers read `window._firstLine` /
 * `window.headers` at call time and touch no DOM, so a bare object shim is all
 * that's required.
 *
 * `getOS` caches its result, so each case sets `window._firstLine` and then
 * calls `resetOsCache()` — the same reset the app runs when a new file loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const win: Record<string, unknown> = {};
(globalThis as unknown as { window: unknown }).window = win;

const { getOS, getHostname, getKernel, grepHeaders, resetOsCache } = await import(
  '../src/client/lib/sarEngine.ts'
);
const { setSarData } = await import('../src/client/lib/sarStore.ts');

/** Store just enough parse result for the identity helpers to read. */
function store(firstLine: string, headers: string[] = []) {
  setSarData({ firstLine, headers, index: {}, fullIndex: {}, dates: [] });
}

function loadFirstLine(firstLine: string) {
  store(firstLine);
  resetOsCache();
}

test('Linux first line: OS, hostname (parens stripped), kernel', () => {
  loadFirstLine('Linux,5.14.0-570.62.1.el9_6.x86_64,(sample-server),04/01/26,_x86_64_,(64 CPU)');
  assert.equal(getOS(), 'LINUX');
  assert.equal(getHostname(), 'sample-server');
  assert.equal(getKernel(), '5.14.0-570.62.1.el9_6.x86_64');
});

test('non-Linux OS token is still detected (used to reject the file)', () => {
  // getHostname/getKernel are Linux-only, but getOS must still surface the
  // real OS token so SarDataBridge can show the "Linux only" notice.
  loadFirstLine('AIX,aixhost,2,7,00F8B2C34C00');
  assert.equal(getOS(), 'AIX');

  loadFirstLine('SunOS,sunhost,5.11,11.4,sun4v');
  assert.equal(getOS(), 'SUNOS');
});

test('getOS caches until resetOsCache is called', () => {
  loadFirstLine('Linux,k,(host),04/01/26');
  assert.equal(getOS(), 'LINUX');

  // Swap the stored first line WITHOUT resetting: the cached value stands.
  store('AIX,aixhost,2,7,krn');
  assert.equal(getOS(), 'LINUX', 'stale until reset');

  // Reset picks up the new first line (mirrors a fresh file load).
  resetOsCache();
  assert.equal(getOS(), 'AIX');
});

test('grepHeaders: first matching header, else -1 (not null)', () => {
  store('Linux,k,(host),04/01/26', ['runq-sz,plist-sz,ldavg-1', 'kbmemfree,kbavail,%memused']);
  assert.equal(grepHeaders('plist-sz'), 'runq-sz,plist-sz,ldavg-1');
  assert.equal(grepHeaders('kbavail'), 'kbmemfree,kbavail,%memused');
  assert.equal(grepHeaders('missing'), -1);
});
