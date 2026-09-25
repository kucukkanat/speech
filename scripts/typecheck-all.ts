// Typechecks every workspace against sibling packages' *sources* (the @kucukkanat/source condition), so no build is
// needed. Declaration output (isolatedDeclarations, against built siblings) is checked by `bun run build`, in order.
import { $ } from "bun";
import { workspaces } from "./workspaces";

for (const { dir } of await workspaces()) await $`bunx tsc -p ${dir}/tsconfig.json`;
console.log("typecheck ok");
