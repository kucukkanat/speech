import { defineConfig } from "@playwright/test";

// End-to-end tests of the built docs site, served exactly as GitHub Pages serves it (under /speech/), with real models
// in a real browser (`bun run test:e2e:docs` from the repo root). Models are cached in .cache/pw-profile after the first run.
export default defineConfig({
  testDir: "./e2e",
  timeout: 15 * 60_000,
  expect: { timeout: 60_000 },
  workers: 1, // one persistent browser profile (the model cache) at a time
  reporter: [["list"]],
  webServer: {
    command: "bun run build && bun run preview --port 5461",
    url: "http://localhost:5461/speech/",
    reuseExistingServer: false,
    timeout: 5 * 60_000,
  },
});
