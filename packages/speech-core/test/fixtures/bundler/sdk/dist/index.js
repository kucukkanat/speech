// Shaped like a built SDK engine: a worker and a bundled audio asset referenced relative to the module.
export const spawn = () => new Worker(new URL("./demo.worker.js", import.meta.url), { type: "module" });
export const tone = new URL("../assets/tone.wav", import.meta.url);
