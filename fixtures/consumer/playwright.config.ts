import { defineConfig } from "@playwright/test";

// FIXTURE_MODE picks how the app is built and served: "dev" (Vite dev server), "build" (Vite production build),
// "esbuild" or "bun" (bundled with speechSdk() from @kucukkanat/speech-core/esbuild, served as static files), or
// "bun-serve" (Bun's HTML dev server, with the plugin from bunfig.toml).
const mode = process.env.FIXTURE_MODE ?? "build";
const serve = "--port 5470 --strictPort";
const commands: Record<string, string> = {
  dev: `bunx vite ${serve}`,
  build: `bunx vite build && bunx vite preview ${serve}`,
  esbuild: `bun bundle.ts esbuild && bunx vite preview --outDir dist-esbuild ${serve}`,
  bun: `bun bundle.ts bun && bunx vite preview --outDir dist-bun ${serve}`,
  "bun-serve": "bun serve.ts",
};
const command = commands[mode];
if (!command) throw new Error(`Unknown FIXTURE_MODE "${mode}"`);

export default defineConfig({
  testDir: ".",
  testMatch: "consumer.spec.ts",
  use: {
    baseURL: "http://localhost:5470",
    launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
    permissions: ["microphone"],
  },
  webServer: { command, url: "http://localhost:5470", reuseExistingServer: false, timeout: 120_000 },
});
