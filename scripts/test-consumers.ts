// Packs every SDK package exactly as it would be published (`bun pm pack` rewrites workspace:* versions), installs
// the tarballs into a clean app and checks them in a real browser — built four ways: Vite dev, a Vite production build,
// esbuild, Bun.build and Bun's HTML dev server (all three with the SDK's speechSdk() plugin).
import { rm } from "node:fs/promises";
import { $ } from "bun";
import { workspaces } from "./workspaces";

const FIXTURE = "fixtures/consumer";
const packages = await workspaces("packages/*/package.json");
await $`bun run build`;

const deps: Record<string, string> = {};
for (const { dir, manifest } of packages) {
  for (const old of new Bun.Glob("*.tgz").scanSync({ cwd: dir, absolute: true })) await rm(old);
  await $`bun pm pack`.cwd(dir).quiet();
  const [tarball] = [...new Bun.Glob("*.tgz").scanSync({ cwd: dir, absolute: true })];
  if (!tarball) throw new Error(`${manifest.name}: bun pm pack produced no tarball`);
  deps[manifest.name] = `file:${tarball}`;
}

const pkgPath = `${FIXTURE}/package.json`;
const pkg = await Bun.file(pkgPath).json();
// `overrides` make the packages' dependencies on each other resolve to the tarballs too (their packed manifests say
// "0.0.0", which isn't on the registry).
await Bun.write(pkgPath, `${JSON.stringify({ ...pkg, dependencies: { ...pkg.dependencies, ...deps }, overrides: deps }, null, 2)}\n`);
await rm(`${FIXTURE}/node_modules`, { recursive: true, force: true });
await rm(`${FIXTURE}/bun.lock`, { force: true });
try {
  await $`bun install`.cwd(FIXTURE);
  for (const mode of ["dev", "build", "esbuild", "bun", "bun-serve"]) {
    await $`bunx playwright test -c playwright.config.ts`.cwd(FIXTURE).env({ ...process.env, FIXTURE_MODE: mode });
  }
} finally {
  // Keep the committed fixture free of machine-specific tarball paths.
  await Bun.write(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}
console.log("consumers ok: packed packages work with Vite (dev + build), esbuild, Bun.build and Bun's dev server");
