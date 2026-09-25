import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as esbuild from "esbuild";
import { speechSdk } from "../src/esbuild.js";

// Real builds with both bundlers over a package shaped like the SDK's dist/ (test/fixtures/bundler).
const fixture = (file: string) => new URL(`./fixtures/bundler/${file}`, import.meta.url).pathname;
const tmp = () => mkdtemp(join(tmpdir(), "speech-sdk-plugin-"));

async function inspect(outdir: string, main: string) {
  const files = await readdir(outdir);
  const find = (re: RegExp) => files.find((f) => re.test(f)) ?? "";
  const worker = find(/^demo\.worker-\w+\.js$/);
  const wav = find(/^tone-\w+\.wav$/);
  return {
    worker,
    wav,
    main: await readFile(join(outdir, main), "utf8"),
    workerCode: await readFile(join(outdir, worker), "utf8"),
    wavBytes: await readFile(join(outdir, wav), "utf8"),
  };
}

const expectRewritten = (out: Awaited<ReturnType<typeof inspect>>) => {
  expect(out.main).toContain(`"./${out.worker}"`); // the worker URL points at the emitted, hashed file…
  expect(out.main).toContain(`"./${out.wav}"`); // …and so does the audio asset
  expect(out.main).not.toMatch(/new URL\(["']\.\/demo\.worker\.js/); // no URL to the unbundled original is left
  expect(out.workerCode).toContain("HELPER_WAS_BUNDLED"); // the worker was bundled with its imports
  expect(out.workerCode).not.toMatch(/from\s*["']\.\/helper/);
  expect(out.wavBytes).toBe("RIFF-fixture-bytes");
  expect(out.main).toContain("import.meta.url"); // untouched module (plain/) kept as is
};

describe("speechSdk() for esbuild", () => {
  test("bundles workers and emits assets next to the bundle", async () => {
    const outdir = await tmp();
    await esbuild.build({ entryPoints: [fixture("app.js")], bundle: true, format: "esm", outdir, plugins: [speechSdk()] });
    expectRewritten(await inspect(outdir, "app.js"));
  });

  test("minifies workers and forwards resolve conditions when the build does", async () => {
    const outdir = await tmp();
    await esbuild.build({
      entryPoints: [fixture("app.js")],
      bundle: true,
      format: "esm",
      outdir,
      minify: true,
      conditions: ["browser"],
      plugins: [speechSdk()],
    });
    const out = await inspect(outdir, "app.js");
    expect(out.workerCode).toContain("HELPER_WAS_BUNDLED");
    expect(out.workerCode.trim().split("\n").length).toBeLessThanOrEqual(2);
  });
});

describe("speechSdk() for Bun.build", () => {
  test("bundles workers and emits assets next to the bundle", async () => {
    const outdir = await tmp();
    const result = await Bun.build({ entrypoints: [fixture("app.js")], outdir, target: "browser", plugins: [speechSdk()] });
    expect(result.success).toBe(true);
    expectRewritten(await inspect(outdir, "app.js"));
  });

  test("minifies workers when the build does", async () => {
    const outdir = await tmp();
    await Bun.build({ entrypoints: [fixture("app.js")], outdir, target: "browser", minify: true, plugins: [speechSdk()] });
    const out = await inspect(outdir, "app.js");
    expect(out.workerCode.trim().split("\n").length).toBeLessThanOrEqual(2);
  });

  test("a worker that doesn't bundle fails the build with the bundler's error", async () => {
    const outdir = await tmp();
    const build = Bun.build({ entrypoints: [fixture("broken-app.js")], outdir, target: "browser", plugins: [speechSdk()] });
    // Bun reports plugin errors as an AggregateError of build messages.
    const message = await build.then(
      () => "built",
      (e: unknown) => (e instanceof AggregateError ? e.errors.map(String).join("\n") : String(e)),
    );
    expect(message).toMatch(/speechSdk: bundling .*broken\.worker\.js failed/);
  });
});
