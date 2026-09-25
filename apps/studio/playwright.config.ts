import { defineConfig } from "@playwright/test";

// End-to-end tests against the real app, real models and a real browser (`bun run test:e2e` from the repo root).
// The first run downloads the models (~0.9 GB) into .cache/pw-profile; later runs reuse that browser profile.
export default defineConfig({
  testDir: "./e2e",
  timeout: 15 * 60_000,
  expect: { timeout: 60_000 },
  workers: 1, // one persistent browser profile (the model cache) at a time
  reporter: [["list"]],
  webServer: {
    command: "bun run dev --port 5460 --strictPort",
    env: { HTTP: "1" },
    url: "http://localhost:5460",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
