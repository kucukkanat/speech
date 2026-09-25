// Builds main.ts with esbuild or Bun.build (`bun bundle.ts esbuild|bun`) into dist-<bundler>/, using the SDK's plugin
// exactly as the docs show — then `vite preview --outDir dist-<bundler>` serves it as a plain static site.
import { speechSdk } from "@kucukkanat/speech-core/esbuild";
import * as esbuild from "esbuild";

const bundler = process.argv[2];
const outdir = `dist-${bundler}`;
if (bundler === "esbuild") {
  await esbuild.build({ entryPoints: ["main.ts"], bundle: true, format: "esm", minify: true, outdir, plugins: [speechSdk()] });
} else if (bundler === "bun") {
  const result = await Bun.build({ entrypoints: ["main.ts"], outdir, target: "browser", minify: true, plugins: [speechSdk()] });
  if (!result.success) throw new AggregateError(result.logs, "Bun.build failed");
} else {
  throw new Error(`Usage: bun bundle.ts esbuild|bun (got ${String(bundler)})`);
}
await Bun.write(`${outdir}/index.html`, (await Bun.file("index.html").text()).replace("/main.ts", "./main.js"));
