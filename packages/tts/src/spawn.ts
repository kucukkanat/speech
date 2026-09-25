// Must stay a literal `new Worker(new URL("./tts.worker.js", import.meta.url), …)` so Vite, webpack and Turbopack can
// find and bundle the worker. In source, Vite resolves ./tts.worker.js to ./tts.worker.ts; in dist the .js exists.
export const spawnTtsWorker = (): Worker =>
  new Worker(new URL("./tts.worker.js", import.meta.url), { type: "module", name: "kucukkanat-tts" });
