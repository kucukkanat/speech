import { speechSdk } from "@kucukkanat/speech-core/vite";
import { defineConfig } from "blume";

export default defineConfig({
  title: "Speech SDK",
  description: "On-device text-to-speech with voice cloning and streaming speech-to-text for the browser. No server, no API keys.",
  logo: "/logo.svg",
  github: { owner: "kucukkanat", repo: "speech", dir: "apps/docs" },
  theme: { accent: "purple", radius: "md" },
  // GitHub Pages serves this project site from https://kucukkanat.github.io/speech/.
  deployment: { site: "https://kucukkanat.github.io", base: "/speech" },
  integrations: [
    {
      // Blume has no Vite option; an Astro integration is its hook into the Vite config the site is built with.
      name: "kucukkanat-speech-sdk",
      hooks: {
        "astro:config:setup": ({ updateConfig }) => {
          updateConfig({
            vite: {
              // Keeps the SDKs out of dependency pre-bundling (so their Web Workers are found) and emits ES workers.
              // No `isolation`: GitHub Pages can't send COOP/COEP headers, and WebGPU doesn't need them.
              plugins: [speechSdk()],
              // Run the workspace SDK sources: the docs always demo the code in this commit, not a published release.
              resolve: { conditions: ["@kucukkanat/source", "module", "browser", "development|production"] },
            },
          });
        },
      },
    },
  ],
});
