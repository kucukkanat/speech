import type { ModelInfo } from "@kucukkanat/speech-core";

export type SttModelKey = "moonshine-base" | "voxtral-realtime";

export interface SttModelInfo<K extends SttModelKey = SttModelKey> extends ModelInfo<K> {
  /** Words appear while you speak (true), or per utterance after short pauses with live re-decoding (false). */
  readonly nativeStreaming: boolean;
  readonly languages: readonly string[];
}

/** Every speech-to-text model the SDK can run, keyed by {@link SttModelKey}. */
export const STT_MODELS: { readonly [K in SttModelKey]: SttModelInfo<K> } = {
  "moonshine-base": {
    key: "moonshine-base",
    label: "Moonshine Base",
    repo: "onnx-community/moonshine-base-ONNX",
    // WebGPU: fp32 encoder 81 + q4 decoder 73 MB; WASM fallback: q8 encoder 21 + q8 decoder 43 MB
    approxDownloadMB: 158,
    requiresWebGPU: false,
    description:
      "Small, fast English model that runs anywhere (WebGPU or WASM). Live text via rolling re-transcription, finalised at pauses.",
    nativeStreaming: false,
    languages: ["en"],
  },
  "voxtral-realtime": {
    key: "voxtral-realtime",
    label: "Voxtral Realtime",
    repo: "onnx-community/Voxtral-Mini-4B-Realtime-2602-ONNX",
    // q4f16: audio_encoder 586 + embed_tokens 233 + decoder_model_merged 2016 + tokenizer 13 MB
    approxDownloadMB: 2850,
    requiresWebGPU: true,
    description:
      "Mistral's natively streaming 4B model — words appear ~0.5 s after you say them. 13 languages, near-offline accuracy. Needs a strong GPU.",
    nativeStreaming: true,
    languages: ["en", "fr", "es", "de", "ru", "zh", "ja", "it", "pt", "nl", "ar", "hi", "ko"],
  },
};

export function isSttModelKey(value: unknown): value is SttModelKey {
  return typeof value === "string" && Object.hasOwn(STT_MODELS, value);
}
