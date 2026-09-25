export const spawn = () => new Worker(new URL("./broken.worker.js", import.meta.url), { type: "module" });
