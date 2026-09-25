import type { Device } from "./types.js";

export interface DeviceProbe {
  device: Device;
  /** WebGPU adapter supports half-precision shaders (enables fp16 / q4f16 model variants) */
  shaderF16: boolean;
}

/**
 * Picks the fastest available backend. Works in windows and workers; only GPU *absence* is a normal outcome here —
 * adapter request failures are treated the same (the driver told us no), so the caller falls back to WASM.
 */
export async function probeDevice(preferred: Device | "auto" = "auto"): Promise<DeviceProbe> {
  if (preferred === "wasm") return { device: "wasm", shaderF16: false };
  const gpu = (globalThis.navigator as (Navigator & { gpu?: GPU }) | undefined)?.gpu;
  const adapter = await gpu?.requestAdapter({ powerPreference: "high-performance" }).catch(() => null);
  if (!adapter) return { device: "wasm", shaderF16: false };
  return { device: "webgpu", shaderF16: adapter.features.has("shader-f16") };
}

/**
 * The ONNX Runtime device name for `device`. In browsers the CPU backend is WebAssembly ("wasm"); under Node/Bun
 * (tests, scripts) transformers.js uses native ONNX Runtime, whose CPU device is called "cpu".
 */
export function onnxDevice(device: Device): Device | "cpu" {
  const serverRuntime = typeof process !== "undefined" && typeof process.versions?.node === "string";
  return device === "wasm" && serverRuntime ? "cpu" : device;
}
