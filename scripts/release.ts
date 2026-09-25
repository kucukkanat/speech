// Publishes every SDK package whose current version isn't on npm yet, in dependency order, then tags the release.
// `bun pm pack` rewrites workspace:* ranges to real versions; `npm publish <tarball> --provenance` adds signed build
// provenance (npm trusted publishing via GitHub OIDC — no NPM_TOKEN needed in CI).
// Usage: bun run release            (CI, after `changeset version` has bumped versions)
//        bun run release --dry-run  (pack and show what would be published)
import { rm } from "node:fs/promises";
import { $ } from "bun";
import { workspaces } from "./workspaces";

const dryRun = process.argv.includes("--dry-run");
let published = 0;
for (const { dir, manifest } of await workspaces("packages/*/package.json")) {
  const { name, version } = (await Bun.file(`${dir}/package.json`).json()) as { name: string; version: string };
  const onRegistry = await $`npm view ${name}@${version} version`.quiet().nothrow();
  if (onRegistry.exitCode === 0 && onRegistry.stdout.toString().trim() === version) {
    console.log(`= ${name}@${version} is already published`);
    continue;
  }
  for (const old of new Bun.Glob("*.tgz").scanSync({ cwd: dir, absolute: true })) await rm(old);
  await $`bun pm pack`.cwd(dir).quiet();
  const [tarball] = [...new Bun.Glob("*.tgz").scanSync({ cwd: dir, absolute: true })];
  if (!tarball) throw new Error(`${manifest.name}: bun pm pack produced no tarball`);
  console.log(`${dryRun ? "would publish" : "publishing"} ${name}@${version}`);
  await $`npm publish ${tarball} --access public ${dryRun ? "--dry-run" : "--provenance"}`;
  published++;
}
if (published && !dryRun) await $`bunx changeset tag`;
console.log(dryRun ? "dry run complete" : `${published} package(s) published`);
