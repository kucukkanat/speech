// Publishing lint for every SDK package: publint (manifest ↔ files, exports shape) and Are-The-Types-Wrong (every
// export resolves to correct types under modern resolution modes). Run after `bun run build`.
import { $ } from "bun";
import { workspaces } from "./workspaces";

for (const { dir, manifest } of await workspaces("packages/*/package.json")) {
  console.log(`\n▶ ${manifest.name}`);
  await $`bunx publint --strict`.cwd(dir);
  // esm-only: these are browser ESM packages; node10/CJS resolution is intentionally unsupported.
  await $`bunx attw --pack . --profile esm-only --quiet`.cwd(dir);
}
console.log("\npackages ok");
