import { defineConfig } from "@playwright/test";

// FIXTURE_MODE=dev runs against `vite` (dev server), otherwise against a production build (`vite preview`).
const dev = process.env.FIXTURE_MODE === "dev";
export default defineConfig({
  testDir: ".",
  testMatch: "consumer.spec.ts",
  use: {
    baseURL: "http://localhost:5470",
    launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
    permissions: ["microphone"],
  },
  webServer: {
    command: dev ? "bunx vite --port 5470 --strictPort" : "bunx vite build && bunx vite preview --port 5470 --strictPort",
    url: "http://localhost:5470",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
