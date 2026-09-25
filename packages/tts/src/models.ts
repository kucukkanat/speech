import { type ModelInfo, SpeechError } from "@kucukkanat/speech-core";

export type TtsModelKey = "chatterbox-turbo" | "chatterbox";

export interface TtsModelInfo<K extends TtsModelKey = TtsModelKey> extends ModelInfo<K> {
  /** What this model accepts beyond text + voice. */
  readonly supports: {
    /** Inline paralinguistic tags such as "[laugh]" or "[sigh]" */
    readonly tags: boolean;
    /** The `exaggeration` (emotion intensity) speak option */
    readonly exaggeration: boolean;
  };
  /** The model's default token sampling; the `sampling` speak option overrides any of it per call. */
  readonly sampling: Sampling;
}

/**
 * How the next speech token is picked. Chatterbox samples like Resemble's reference implementation; tweak it to trade
 * consistency for expressiveness. Every option is per call: `speak(text, { sampling: { temperature: 0.6 } })`.
 */
export interface Sampling {
  /** Randomness: lower is steadier and flatter, higher is livelier but more likely to slur or ramble. */
  readonly temperature: number;
  /** Sample only among the k most likely tokens (0 = no limit). */
  readonly topK: number;
  /** Nucleus sampling: only the most likely tokens that together reach this probability (1 = off). */
  readonly topP: number;
  /** Drop tokens less than `minP` × as likely as the best one (0 = off). */
  readonly minP: number;
  /** Above 1, discourages repeating recent speech tokens: fewer stutters and loops (1 = off). */
  readonly repetitionPenalty: number;
}

/** Accepted range of each {@link Sampling} option (inclusive). `topK` must also be a whole number. */
export const SAMPLING_RANGES: { readonly [K in keyof Sampling]: { readonly min: number; readonly max: number } } = {
  temperature: { min: 0.05, max: 2 },
  topK: { min: 0, max: 8192 },
  topP: { min: 0.05, max: 1 },
  minP: { min: 0, max: 1 },
  repetitionPenalty: { min: 1, max: 3 },
};

/** Throws `unsupported-option` for a sampling value outside {@link SAMPLING_RANGES}. */
export function validateSampling(sampling: Partial<Sampling>): void {
  for (const [name, value] of Object.entries(sampling)) {
    if (!Object.hasOwn(SAMPLING_RANGES, name)) {
      throw new SpeechError("unsupported-option", `Unknown sampling option \`${name}\`.`);
    }
    const { min, max } = SAMPLING_RANGES[name as keyof Sampling];
    const whole = name !== "topK" || Number.isInteger(value);
    if (!(typeof value === "number" && value >= min && value <= max && whole)) {
      const kind = name === "topK" ? "a whole number" : "a number";
      throw new SpeechError("unsupported-option", `\`sampling.${name}\` must be ${kind} between ${min} and ${max} (got ${String(value)}).`);
    }
  }
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
    // As in Resemble's tts_turbo.py.
    sampling: { temperature: 0.8, topK: 1000, topP: 0.95, minP: 0, repetitionPenalty: 1.2 },
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
    // As in Resemble's tts.py.
    sampling: { temperature: 0.8, topK: 0, topP: 1, minP: 0.05, repetitionPenalty: 1.2 },
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
