import { type PcmAudio, SpeechError } from "@kucukkanat/speech-core";
import { downmix } from "./wav.js";

/** Decodes compressed audio with the browser's decoder (OfflineAudioContext keeps the native rate, needs no gesture). */
export async function decodeWithWebAudio(bytes: Uint8Array): Promise<PcmAudio> {
  if (typeof OfflineAudioContext === "undefined") {
    throw new SpeechError("unsupported-environment", "Only WAV files can be decoded outside a browser (no Web Audio here).");
  }
  const ctx = new OfflineAudioContext(1, 1, 44100);
  const copy = bytes.slice().buffer; // decodeAudioData detaches its input
  const buffer = await ctx.decodeAudioData(copy).catch((e: unknown) => {
    throw new SpeechError("decode-failed", "This audio format could not be decoded by the browser.", { cause: e });
  });
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  return { pcm: downmix(channels), sampleRate: buffer.sampleRate };
}
