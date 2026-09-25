// Builds every SDK package in dependency order, then the apps (Voice Lab and the docs site).
import { $ } from "bun";
import { workspaces } from "./workspaces";

for (const { dir } of await workspaces("packages/*/package.json")) await $`bun run build`.cwd(dir);
for (const app of ["apps/studio", "apps/docs"]) await $`bun run build`.cwd(app);
