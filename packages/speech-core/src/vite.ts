import type { Plugin } from "vite";

export interface SpeechSdkPluginOptions {
  /**
   * Serve pages cross-origin isolated (COOP `same-origin` + COEP `credentialless`) in dev and preview. That enables
   * multi-threaded WASM when WebGPU is missing; model downloads from Hugging Face keep working with `credentialless`.
   * Production hosting needs the same two headers (see the README). Default: false.
   */
  isolation?: boolean;
}

const PACKAGES = ["@huggingface/transformers", "@kucukkanat/tts", "@kucukkanat/stt", "@kucukkanat/speech-audio"];

/**
 * One-line Vite setup for the speech SDKs. Keeps the SDKs out of dependency pre-bundling (so their Web Workers stay
 * detectable and load from the right URL), emits ES-module workers, and optionally sets isolation headers.
 */
export function speechSdk(options: SpeechSdkPluginOptions = {}): Plugin {
  const headers = options.isolation
    ? { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "credentialless" }
    : undefined;
  return {
    name: "kucukkanat-speech-sdk",
    config: () => ({
      optimizeDeps: { exclude: PACKAGES },
      worker: { format: "es" },
      ...(headers ? { server: { headers }, preview: { headers } } : {}),
    }),
  };
}
