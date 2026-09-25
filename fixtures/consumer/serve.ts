// Bun's full-stack dev server (HTML imports): bundles index.html → main.ts on request, with speechSdk() registered
// through bunfig.toml ([serve.static] plugins), as the docs show.
import index from "./index.html";

Bun.serve({ port: 5470, routes: { "/": index } });
