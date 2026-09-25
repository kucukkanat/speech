// Builds every SDK package in dependency order, then the studio app.
import { $ } from "bun";
import { workspaces } from "./workspaces";

for (const { dir } of await workspaces("packages/*/package.json")) await $`bun run build`.cwd(dir);
await $`bun run build`.cwd("apps/studio");
