import { probeDevice } from "./device.browser.js";

/** What the current browser can do, for gating UI before anything is downloaded. */
export interface Capabilities {
  /** A usable WebGPU adapter exists (not just `navigator.gpu`) */
  webgpu: boolean;
  /** WebGPU supports half precision: smaller, faster model variants */
  shaderF16: boolean;
  /** HTTPS or localhost: required for the microphone */
  secureContext: boolean;
  /** COOP/COEP isolation: enables multi-threaded WASM when WebGPU is unavailable */
  crossOriginIsolated: boolean;
  /** getUserMedia + AudioWorklet are available */
  microphone: boolean;
}

/** Detects browser capabilities. Never throws; safe to call during SSR (everything reports false). */
export async function detectCapabilities(): Promise<Capabilities> {
  const g = globalThis as typeof globalThis & { isSecureContext?: boolean; crossOriginIsolated?: boolean };
  const { device, shaderF16 } = await probeDevice();
  return {
    webgpu: device === "webgpu",
    shaderF16,
    secureContext: g.isSecureContext === true,
    crossOriginIsolated: g.crossOriginIsolated === true,
    microphone: typeof g.navigator?.mediaDevices?.getUserMedia === "function" && typeof g.AudioWorkletNode === "function",
  };
}
