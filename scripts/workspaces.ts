// Workspace package directories in dependency order (a package comes after everything it depends on).
import { Glob } from "bun";

interface Manifest {
  name: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface Workspace {
  dir: string;
  manifest: Manifest;
}

export async function workspaces(pattern = "{packages,apps}/*/package.json"): Promise<Workspace[]> {
  const all: Workspace[] = [];
  for (const file of new Glob(pattern).scanSync()) {
    all.push({ dir: file.replace(/\/package\.json$/, ""), manifest: (await Bun.file(file).json()) as Manifest });
  }
  const byName = new Map(all.map((w) => [w.manifest.name, w]));
  const ordered: Workspace[] = [];
  const visit = (w: Workspace, trail: string[]) => {
    if (ordered.includes(w)) return;
    if (trail.includes(w.manifest.name)) throw new Error(`Dependency cycle: ${[...trail, w.manifest.name].join(" → ")}`);
    const deps = { ...w.manifest.dependencies, ...w.manifest.peerDependencies, ...w.manifest.devDependencies };
    for (const name of Object.keys(deps)) {
      const dep = byName.get(name);
      if (dep) visit(dep, [...trail, w.manifest.name]);
    }
    ordered.push(w);
  };
  for (const w of all) visit(w, []);
  return ordered;
}
