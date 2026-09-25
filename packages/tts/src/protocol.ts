// Messages between the TextToSpeech client and its worker (see @kucukkanat/speech-core rpc).
import type { Device, LoadProgress, SpeakerConditioning, TransformersOptions } from "@kucukkanat/speech-core";
import type { TtsModelKey } from "./models.js";

export const SAMPLE_RATE = 24000;

/** One streamed piece of generated audio. The last piece of each sentence has `final: true` and may be empty. */
export interface GeneratedPiece {
  sentence: { index: number; count: number; text: string };
  pcm: Float32Array;
  genMs: number;
  final: boolean;
}

export interface TtsProtocol {
  load: {
    arg: { model: TtsModelKey; device: Device | "auto"; transformers: TransformersOptions };
    result: { device: Device };
    event: never;
  };
  encode: { arg: { pcm: Float32Array; sampleRate: number }; result: SpeakerConditioning; event: never };
  generate: {
    arg: { text: string; conditioning: SpeakerConditioning; exaggeration?: number };
    result: { audioSeconds: number; totalMs: number };
    event: GeneratedPiece;
  };
  unload: { arg: undefined; result: undefined; event: never };
}

export type TtsBroadcast = { type: "progress"; model: TtsModelKey; progress: LoadProgress };
