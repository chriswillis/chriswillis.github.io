/**
 * The fuzz campaign, off the main thread.
 *
 * `fuzz()` is one synchronous call over thousands of solves, so running it on
 * the UI thread would freeze the page for the length of the campaign. It is
 * dependency-light and takes its references as plain data, which is exactly what
 * makes it portable to a worker: the DNA arrives by postMessage, the progress
 * callback posts back, and nothing in the library needs to know where it is.
 */
import { parseDNA, type SystemDNA } from '../src/dna/schema.ts';
import { fuzz } from '../src/validate/fuzz.ts';

self.onmessage = (ev: MessageEvent<{ dna: Record<string, unknown>; cases: number; seed: number }>) => {
  try {
    const references: Record<string, SystemDNA> = {};
    for (const [id, v] of Object.entries(ev.data.dna)) references[id] = parseDNA(JSON.stringify(v));
    let lastPost = 0;
    const result = fuzz({
      references,
      cases: ev.data.cases,
      seed: ev.data.seed,
      onProgress: (done, total) => {
        const now = Date.now();
        if (now - lastPost > 120 || done === total) { lastPost = now; (self as unknown as Worker).postMessage({ kind: 'progress', done, total }); }
      },
    });
    (self as unknown as Worker).postMessage({ kind: 'done', result });
  } catch (e) {
    (self as unknown as Worker).postMessage({ kind: 'error', message: (e as Error).message ?? String(e) });
  }
};
