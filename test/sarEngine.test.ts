/**
 * Unit coverage for the server-identity helpers in `src/client/lib/sarEngine.ts`
 * — `getOS`, `getHostname`, `getKernel`, `grepHeaders`. These parse the SAR
 * first line differently per OS (Linux/AIX/SunOS), which is easy to break and
 * is otherwise only exercised for Linux via the fixture regression suite.
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

function loadFirstLine(firstLine: string) {
  win._firstLine = firstLine;
  resetOsCache();
}

test('Linux first line: OS, hostname (parens stripped), kernel', () => {
  loadFirstLine('Linux,5.14.0-570.62.1.el9_6.x86_64,(sample-server),04/01/26,_x86_64_,(64 CPU)');
  assert.equal(getOS(), 'LINUX');
  assert.equal(getHostname(), 'sample-server');
  assert.equal(getKernel(), '5.14.0-570.62.1.el9_6.x86_64');
});

test('AIX first line: hostname from field 1, kernel from field 4', () => {
  loadFirstLine('AIX,aixhost,2,7,00F8B2C34C00');
  assert.equal(getOS(), 'AIX');
  assert.equal(getHostname(), 'aixhost');
  assert.equal(getKernel(), '00F8B2C34C00');
});

test('SunOS first line: hostname from field 1, kernel from field 3', () => {
  loadFirstLine('SunOS,sunhost,5.11,11.4,sun4v');
  assert.equal(getOS(), 'SUNOS');
  assert.equal(getHostname(), 'sunhost');
  assert.equal(getKernel(), '11.4');
});

test('unknown OS: empty hostname, "Unknown" kernel', () => {
  loadFirstLine('Weird,foo,bar');
  assert.equal(getOS(), 'WEIRD');
  assert.equal(getHostname(), '');
  assert.equal(getKernel(), 'Unknown');
});

test('getOS caches until resetOsCache is called', () => {
  loadFirstLine('Linux,k,(host),04/01/26');
  assert.equal(getOS(), 'LINUX');

  // Swap the first line WITHOUT resetting: the cached value stands.
  win._firstLine = 'AIX,aixhost,2,7,krn';
  assert.equal(getOS(), 'LINUX', 'stale until reset');

  // Reset picks up the new first line (mirrors a fresh file load).
  resetOsCache();
  assert.equal(getOS(), 'AIX');
});

test('grepHeaders: first matching header, else -1 (not null)', () => {
  win.headers = ['runq-sz,plist-sz,ldavg-1', 'kbmemfree,kbavail,%memused'];
  assert.equal(grepHeaders('plist-sz'), 'runq-sz,plist-sz,ldavg-1');
  assert.equal(grepHeaders('kbavail'), 'kbmemfree,kbavail,%memused');
  assert.equal(grepHeaders('missing'), -1);
});
