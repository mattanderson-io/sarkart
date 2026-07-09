import { parentPort } from 'node:worker_threads';

// Returns each section pre-joined into one string (fewer, larger objects to
// structure-clone back to the main thread).
const { parseBytesJoined } = await import('../src/client/lib/sarParseCore.ts');

parentPort.on('message', (msg) => {
  parentPort.postMessage(parseBytesJoined(new Uint8Array(msg.buffer)));
});
