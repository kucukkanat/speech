// Messages between the SpeechToText client and its worker (see @kucukkanat/speech-core rpc).
import type { Device, LoadProgress, TransformersOptions } from "@kucukkanat/speech-core";
import type { StreamUpdate } from "./internal/text.js";
import type { SttModelKey } from "./models.js";

export interface SttProtocol {
  load: {
    arg: { model: SttModelKey; device: Device | "auto"; transformers: TransformersOptions };
    result: { device: Device };
    event: never;
  };
  /**
   * A transcription session: stays open (streaming updates) until `end`, then resolves with the final text. `live`
   * enables Moonshine's rolling partials (off for files, where only finished utterances matter).
   */
  open: { arg: { live: boolean }; result: StreamUpdate; event: StreamUpdate };
  /** 16 kHz mono audio for the open session. */
  push: { arg: { pcm: Float32Array }; result: undefined; event: never };
  /** No more audio: flush and let `open` resolve. */
  end: { arg: undefined; result: undefined; event: never };
  unload: { arg: undefined; result: undefined; event: never };
}

export type SttBroadcast = { type: "progress"; model: SttModelKey; progress: LoadProgress };
