/**
 * Main-thread orchestrator for the worker-parallel SAR parse.
 *
 * Splits the file's bytes into ~N contiguous chunks at identity-line
 * boundaries (each SAR capture block carries its own section headers, so a run
 * of whole blocks parses independently), fans them out to N dedicated Web
 * Workers (N chosen by workersForSize), and merges the JOINED per-chunk results
 * back into one. Chunks are TRANSFERRED (zero-copy) to workers; workers return
 * the compact joined shape so the clone-back stays cheap and flat even for
 * multi-GB files — the whole reason this path exists (it also lifts the
 * ~512 MB single-JS-string ceiling that FileReader.readAsText hits).
 */
import { findSplitOffsets, mergeJoined, workersForSize } from './sarParseCore';
import type { SarJoinedResult } from './sarParseCore';

export type ParseProgress = (percent: number) => void;

export function parseArrayBufferParallel(
  buffer: ArrayBuffer,
  onProgress?: ParseProgress
): Promise<SarJoinedResult> {
  const bytes = new Uint8Array(buffer);
  const nWorkers = workersForSize(bytes.length);
  const offsets = findSplitOffsets(bytes, nWorkers);
  const nChunks = offsets.length - 1;

  return new Promise<SarJoinedResult>((resolve, reject) => {
    const partials = new Array<SarJoinedResult>(nChunks);
    const workers: Worker[] = [];
    let done = 0;
    let settled = false;

    const cleanup = () => workers.forEach((w) => w.terminate());
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    for (let i = 0; i < nChunks; i += 1) {
      // .slice() gives each chunk its own ArrayBuffer, so it can be transferred
      // (detached from the main thread) rather than copied into the worker.
      const chunk = bytes.slice(offsets[i], offsets[i + 1]);
      const worker = new Worker(new URL('./sarWorker.ts', import.meta.url), { type: 'module' });
      workers.push(worker);

      const index = i;
      worker.onmessage = (event: MessageEvent<SarJoinedResult>) => {
        partials[index] = event.data;
        done += 1;
        onProgress?.(Math.round((done / nChunks) * 100));
        if (done === nChunks && !settled) {
          settled = true;
          cleanup();
          try {
            resolve(mergeJoined(partials));
          } catch (err) {
            fail(err);
          }
        }
      };
      worker.onerror = (event) => fail(new Error(`SAR parse worker failed: ${event.message}`));

      worker.postMessage({ buffer: chunk.buffer }, [chunk.buffer]);
    }
  });
}
