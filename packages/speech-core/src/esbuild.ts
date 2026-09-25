import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/**
 * The part of the plugin API this plugin uses. esbuild and Bun.build implement the same one, so `speechSdk()` works in
 * both (`plugins: [speechSdk()]`).
 */
export interface SpeechSdkPluginBuild {
  onResolve(options: { filter: RegExp }, callback: (args: { path: string }) => { path: string; namespace: string } | undefined): unknown;
  onLoad(
    options: { filter: RegExp; namespace?: string },
    callback: (args: { path: string }) => Promise<SpeechSdkLoadResult | undefined>,
  ): unknown;
  /** esbuild's own API (Bun exposes a stub without `build`). */
  esbuild?: { build?(options: EsbuildWorkerOptions): Promise<{ outputFiles: { contents: Uint8Array }[] }> };
  /** esbuild's build options… */
  initialOptions?: { minify?: boolean; conditions?: string[] };
  /** …and Bun's. */
  config?: { minify?: boolean | object; conditions?: string | string[] };
}

export interface SpeechSdkLoadResult {
  contents: string | Uint8Array;
  loader: "js" | "file";
  resolveDir?: string;
}

interface EsbuildWorkerOptions {
  entryPoints: string[];
  bundle: true;
  format: "esm";
  platform: "browser";
  write: false;
  minify: boolean;
  conditions?: string[];
}

export interface SpeechSdkBundlerPlugin {
  name: string;
  setup(build: SpeechSdkPluginBuild): void;
}

// The engines create workers and reference their demo audio with `new URL("./x", import.meta.url)`, which Vite and
// webpack follow but esbuild and Bun.build leave untouched (the files would 404 next to your bundle). This rewrites
// those URLs into imports of the files, which the bundler then emits beside your code with hashed names.
const URL_REF = /new URL\((["'])(\.{1,2}\/[\w./-]+\.(?:worker\.js|wav))\1,\s*import\.meta\.url\)/g;
const NS = "kucukkanat-speech";

/**
 * One-line esbuild / Bun.build setup for the speech SDKs: bundles the engines' Web Workers (with transformers.js) as
 * separate files and emits the bundled demo voices, so `createTTS()`, `createSTT()` and `createVoiceStore()` work
 * with no further configuration.
 */
export function speechSdk(): SpeechSdkBundlerPlugin {
  return {
    name: "kucukkanat-speech-sdk",
    setup(build) {
      const minify = Boolean(build.initialOptions?.minify ?? build.config?.minify);
      const conditions = build.initialOptions?.conditions;
      // A worker is its own program: bundle it (and its dependencies) now, then emit the result as a file.
      const bundleWorker = async (path: string): Promise<Uint8Array> => {
        if (build.esbuild?.build) {
          const out = await build.esbuild.build({
            entryPoints: [path],
            bundle: true,
            format: "esm",
            platform: "browser",
            write: false,
            minify,
            ...(conditions ? { conditions } : {}),
          });
          return Buffer.concat(out.outputFiles.map((f) => f.contents)); // one file: no splitting, no sourcemap
        }
        // A nested Bun.build() inside a running one never settles, so bundle the worker in a child `bun build`.
        const child = Bun.spawn([process.execPath, "build", path, "--target=browser", "--format=esm", ...(minify ? ["--minify"] : [])], {
          stdout: "pipe",
          stderr: "pipe",
        });
        const [code, stderr] = await Promise.all([new Response(child.stdout).bytes(), new Response(child.stderr).text(), child.exited]);
        if (child.exitCode !== 0) throw new Error(`speechSdk: bundling ${path} failed:\n${stderr}`);
        return new Uint8Array(code);
      };

      build.onLoad({ filter: /[\\/]dist[\\/]index\.js$/ }, async ({ path }) => {
        const source = await readFile(path, "utf8");
        if (!source.includes("import.meta.url")) return undefined;
        const imports: string[] = [];
        const contents = source.replace(URL_REF, (_match, _quote: string, rel: string) => {
          const id = `__kucukkanatSpeechFile${imports.length}`;
          imports.push(`import ${id} from ${JSON.stringify(`${NS}:${resolve(dirname(path), rel)}`)};`);
          // Emitted paths are relative ("./x-HASH.js") in builds, but root-absolute ("/_bun/asset/…") in Bun's dev server,
          // where import.meta.url is a file: URL — resolve those against the page instead.
          return `new URL(${id}, ${id}[0] === "/" && globalThis.location ? globalThis.location.href : import.meta.url)`;
        });
        return imports.length ? { contents: `${imports.join("\n")}\n${contents}`, loader: "js", resolveDir: dirname(path) } : undefined;
      });
      build.onResolve({ filter: new RegExp(`^${NS}:`) }, ({ path }) => ({ path: path.slice(NS.length + 1), namespace: NS }));
      build.onLoad({ filter: /.*/, namespace: NS }, async ({ path }) => ({
        contents: path.endsWith(".worker.js") ? await bundleWorker(path) : new Uint8Array(await readFile(path)),
        loader: "file",
      }));
    },
  };
}
