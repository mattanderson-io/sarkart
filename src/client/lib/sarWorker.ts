/**
 * Dedicated Web Worker for the parallel parse path. Receives a transferred
 * byte chunk (one contiguous run of whole SAR capture blocks), parses it with
 * the shared byte-path core, and posts back the compact JOINED result (one
 * '\n'-joined blob per section + row counts) — cheap to structure-clone back.
 *
 * Vite bundles this as a same-origin ES-module worker (see parallelParse.ts's
 * `new Worker(new URL(...), { type: 'module' })`), which satisfies the app's
 * strict CSP (default-src 'self'; no blob: worker).
 */
import { parseBytesJoined } from './sarParseCore';
import type { SarJoinedResult } from './sarParseCore';

// tsconfig uses the DOM lib (not WebWorker), so `self` types as Window and its
// postMessage signature differs. Narrow to just what we use to keep it typed
// without pulling in a conflicting lib.
const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<{ buffer: ArrayBuffer }>) => void) | null;
  postMessage: (message: SarJoinedResult) => void;
};

ctx.onmessage = (event) => {
  const result = parseBytesJoined(new Uint8Array(event.data.buffer));
  ctx.postMessage(result);
};
