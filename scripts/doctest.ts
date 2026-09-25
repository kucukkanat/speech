// Typechecks every ```ts / ```tsx example in the package READMEs and the docs site, so documentation can't drift from the
// API. Each block
// must be self-contained (its own imports), i.e. runnable as-is. Mark a block ```ts no-check to skip it (config files,
// fragments that need a bundler feature such as `?worker` imports).
import { mkdir, rm } from "node:fs/promises";
import { $, Glob } from "bun";

const OUT = ".doctest";
await rm(OUT, { recursive: true, force: true });
let count = 0;
const docs = ["packages/*/README.md", "apps/docs/docs/**/*.mdx"].flatMap((pattern) => [...new Glob(pattern).scanSync()]);
for (const doc of docs) {
  const pkg = doc.replace(/\.mdx?$/, "").replaceAll("/", "_");
  const text = await Bun.file(doc).text();
  for (const [i, match] of [...text.matchAll(/```(tsx?)([^\n]*)\n([\s\S]*?)```/g)].entries()) {
    const [, lang, info = "", code = ""] = match;
    if (info.includes("no-check")) continue;
    await mkdir(`${OUT}/${pkg}`, { recursive: true });
    // `export {}` makes each snippet a module, so top-level await works and names don't clash between snippets.
    await Bun.write(`${OUT}/${pkg}/example-${i + 1}.${lang}`, `${code}\nexport {};\n`);
    count++;
  }
}
await Bun.write(
  `${OUT}/tsconfig.json`,
  JSON.stringify({
    extends: "../tsconfig.base.json",
    compilerOptions: {
      jsx: "react-jsx",
      noUnusedLocals: false,
      // Bun links workspace packages per dependent, not at the root, so point the SDKs (at their sources) and React
      // (from the React package) explicitly — the way a reader's project would resolve them after installing.
      paths: {
        "@kucukkanat/speech-core/esbuild": ["../packages/speech-core/src/esbuild.ts"],
        "@kucukkanat/speech-core/bun": ["../packages/speech-core/src/esbuild.ts"],
        "@kucukkanat/*": ["../packages/*/src/index.ts"],
        react: ["../packages/speech-react/node_modules/@types/react"],
        "react/*": ["../packages/speech-react/node_modules/@types/react/*"],
      },
    },
    include: ["**/*.ts", "**/*.tsx"],
  }),
);
const result = await $`bunx tsc -p ${OUT}/tsconfig.json`.nothrow();
if (result.exitCode !== 0) {
  console.error(`Documentation examples failed to typecheck (see ${OUT}/ for the extracted files).`);
  process.exit(1);
}
console.log(`docs ok: ${count} README and docs-site examples typecheck`);
