import type { ModelInfo } from "@kucukkanat/speech-core";

export type TtsModelKey = "chatterbox-turbo" | "chatterbox";

export interface TtsModelInfo<K extends TtsModelKey = TtsModelKey> extends ModelInfo<K> {
  /** What this model accepts beyond text + voice. */
  readonly supports: {
    /** Inline paralinguistic tags such as "[laugh]" or "[sigh]" */
    readonly tags: boolean;
    /** The `exaggeration` (emotion intensity) speak option */
    readonly exaggeration: boolean;
  };
}

/** Every text-to-speech model the SDK can run, keyed by {@link TtsModelKey}. */
export const TTS_MODELS: { readonly [K in TtsModelKey]: TtsModelInfo<K> } = {
  "chatterbox-turbo": {
    key: "chatterbox-turbo",
    label: "Chatterbox Turbo",
    repo: "ResembleAI/chatterbox-turbo-ONNX",
    // embed fp16 116 + speech_encoder q4f16 177 + language_model q4f16 184 + conditional_decoder q4 246 MB
    approxDownloadMB: 725,
    // In browsers (the quantized graphs need an operator ONNX Runtime's WASM backend lacks); Node/Bun run on CPU.
    requiresWebGPU: true,
    description:
      "Fast distilled model: speaks ~2× faster than real time and streams audio within a sentence. Understands [laugh]-style tags.",
    supports: { tags: true, exaggeration: false },
  },
  chatterbox: {
    key: "chatterbox",
    label: "Chatterbox",
    repo: "onnx-community/chatterbox-ONNX",
    // embed fp32 62 + speech_encoder fp32 591 + language_model q4f16 305 + conditional_decoder fp32 534 MB
    approxDownloadMB: 1495,
    requiresWebGPU: true,
    description:
      "The full 0.5B model with a multi-step decoder: richer, more natural delivery and emotion control. Slower than real time; playback buffers first.",
    supports: { tags: false, exaggeration: true },
  },
};

/** Emotion intensity: 0.25 (flat) … 2 (dramatic), neutral 0.5. */
export const EXAGGERATION = { min: 0.25, max: 2, neutral: 0.5 } as const;

/** Options that only some models accept, typed per model so misuse is a compile error when the model is known. */
export interface TtsModelOptions {
  "chatterbox-turbo": { exaggeration?: never };
  chatterbox: {
    /** Emotion intensity, {@link EXAGGERATION}.min…max (default 0.5). Higher also tends to speed speech up. */
    exaggeration?: number;
  };
}

/**
 * Options for model `M`. When `M` is only known at runtime (the full union), every model's options are allowed and
 * checked when you speak — an option the loaded model doesn't support throws `unsupported-option`.
 */
export type ModelOptionsFor<M extends TtsModelKey> = [TtsModelKey] extends [M] ? { exaggeration?: number } : TtsModelOptions[M];

export function isTtsModelKey(value: unknown): value is TtsModelKey {
  return typeof value === "string" && Object.hasOwn(TTS_MODELS, value);
}
