import type { SpeechError } from "./errors.js";

export type Device = "webgpu" | "wasm";

/** Download / initialisation progress of a model. */
export interface LoadProgress {
  /** 0..1 across all files */
  progress: number;
  /** Bytes, when known */
  loaded?: number;
  total?: number;
  /** Current file or stage, e.g. "language_model_q4f16.onnx_data" or "Warming up" */
  label: string;
}

/** Lifecycle of an engine (a TTS or STT instance), keyed by its model identifier. */
export type EngineStatus<M extends string = string> =
  | { readonly state: "idle" }
  | { readonly state: "loading"; readonly model: M; readonly progress: LoadProgress }
  | { readonly state: "ready"; readonly model: M; readonly device: Device }
  | { readonly state: "error"; readonly model: M; readonly error: SpeechError };

/** Static facts about a model, for pickers and capability checks. */
export interface ModelInfo<K extends string = string> {
  readonly key: K;
  readonly label: string;
  /** Hugging Face repository id */
  readonly repo: string;
  readonly approxDownloadMB: number;
  readonly requiresWebGPU: boolean;
  readonly description: string;
}

/** Options forwarded to transformers.js inside the worker (self-hosting models / ONNX Runtime files, strict CSP, offline). */
export interface TransformersOptions {
  /** Base URL models are fetched from (default: https://huggingface.co/) */
  remoteHost?: string;
  /** Where ONNX Runtime's .wasm/.mjs files are loaded from (default: jsDelivr) */
  wasmPaths?: string;
  /** Cache downloaded models in the browser's Cache Storage (default: true) */
  useBrowserCache?: boolean;
}

/**
 * Serialisable speaker conditioning for voice cloning: model-specific tensors computed once per voice and model.
 * Treat it as opaque; store it through a {@link ConditioningCache}.
 */
export interface SpeakerConditioning {
  readonly modelId: string;
  readonly tensors: Readonly<Record<string, { dims: number[]; type: string; data: ArrayBuffer }>>;
}

/** Where encoded voices are kept. The TTS engine uses an in-memory cache unless you pass a persistent one. */
export interface ConditioningCache {
  get(key: string): Promise<SpeakerConditioning | undefined>;
  set(key: string, value: SpeakerConditioning): Promise<void>;
}

/** Mono PCM audio. */
export interface PcmAudio {
  readonly pcm: Float32Array;
  readonly sampleRate: number;
}
