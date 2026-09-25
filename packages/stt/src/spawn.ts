// Must stay a literal `new Worker(new URL("./stt.worker.js", import.meta.url), …)` so Vite, webpack and Turbopack can
// find and bundle the worker. In source, Vite resolves ./stt.worker.js to ./stt.worker.ts; in dist the .js exists.
export const spawnSttWorker = (): Worker =>
  new Worker(new URL("./stt.worker.js", import.meta.url), { type: "module", name: "kucukkanat-stt" });
