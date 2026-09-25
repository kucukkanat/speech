// Builds the package in the current directory: one ESM bundle per public entry and per worker, side by side in dist/,
// so `new Worker(new URL("./x.worker.js", import.meta.url))` in dist/index.js resolves to dist/x.worker.js.
// Dependencies stay bare imports (the consumer's bundler resolves them); declarations come from tsc.
import { rm } from "node:fs/promises";
import { $, Glob } from "bun";

interface PackageJson {
  name: string;
  exports: Record<string, string | Record<string, string>>;
}

const pkg = (await Bun.file("package.json").json()) as PackageJson;
const sources = Object.values(pkg.exports)
  .flatMap((e) => (typeof e === "object" && e["@kucukkanat/source"] ? [e["@kucukkanat/source"]] : []))
  .filter((s) => !s.endsWith(".worker.ts")); // worker subpaths are built with the workers below (they need a worker scope)
const workers = [...new Glob("src/*.worker.ts").scanSync()];
// The Vite plugin entry runs in Node (inside vite.config), everything else in browsers/workers.
const node = sources.filter((s) => s.endsWith("/vite.ts"));
const browser = [...sources.filter((s) => !node.includes(s)), ...workers];

await rm("dist", { recursive: true, force: true });

const build = async (entrypoints: string[], target: "browser" | "node") => {
  if (!entrypoints.length) return;
  const result = await Bun.build({
    entrypoints,
    root: "src",
    outdir: "dist",
    target,
    format: "esm",
    packages: "external",
    splitting: false,
    sourcemap: "linked",
    // Consumers minify; readable output keeps their stack traces and bug reports useful.
    minify: false,
    // React hooks must be marked as client code for React Server Components frameworks (Next.js app router).
    banner: pkg.name === "@kucukkanat/speech-react" ? '"use client";' : "",
  });
  if (!result.success) throw new AggregateError(result.logs, `${pkg.name}: bundling failed`);
};

await build(browser, "browser");
await build(node, "node");
await $`bunx tsc -p tsconfig.build.json`;

// Guard: every public entry must import without a DOM (SSR-safe) and define every name it exports. This also catches
// a Bun bundler bug (1.3.x) where `"sideEffects": false` in the package being built drops re-exported modules — so
// SDK package.json files deliberately omit `sideEffects` (single-file bundles gain little from it anyway).
for (const source of sources) {
  const out = `${process.cwd()}/dist/${source.replace(/^\.\/src\//, "").replace(/\.ts$/, ".js")}`;
  const mod = (await import(out)) as Record<string, unknown>;
  const missing = Object.entries(mod)
    .filter(([, v]) => v === undefined)
    .map(([k]) => k);
  if (missing.length || !Object.keys(mod).length) throw new Error(`${pkg.name}: ${out} is missing exports ${missing.join(", ")}`);
  // transformers.js (and its ~1 MB of ONNX Runtime glue) belongs in the workers, never in main-thread bundles.
  if ((await Bun.file(out).text()).includes('from "@huggingface/transformers"')) {
    throw new Error(`${pkg.name}: ${out} imports @huggingface/transformers on the main thread; only workers may.`);
  }
}
console.log(`built ${pkg.name}: ${[...browser, ...node].map((e) => e.replace(/^\.?\/?src\//, "")).join(", ")}`);
