import { speechSdk } from "@kucukkanat/speech-core/vite";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import { defaultClientConditions, defineConfig } from "vite";

// HTTPS (self-signed) is on by default because getUserMedia needs a secure context on LAN addresses (e.g. testing from
// a phone). localhost is already secure, so `HTTP=1 bun run dev` serves plain HTTP without the certificate warning.
const https = process.env.HTTP !== "1";

export default defineConfig({
  // speechSdk: keeps the SDKs out of pre-bundling (their workers stay detectable) and serves the app cross-origin
  // isolated, which enables multi-threaded WASM when WebGPU is missing (model downloads still work: credentialless).
  plugins: [react(), tailwindcss(), ...(https ? [basicSsl({ name: "voice-lab" })] : []), speechSdk({ isolation: true })],
  // Resolve the workspace SDK packages to their TypeScript sources: edits to packages/* hot-reload with no build step.
  resolve: { conditions: ["@kucukkanat/source", ...defaultClientConditions] },
  server: { host: true, port: 5443 },
  preview: { host: true, port: 5443 },
  build: { target: "es2022" },
});
