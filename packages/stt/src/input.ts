import { type AudioInput, decodeAudio, resample } from "@kucukkanat/speech-audio";
import { FRAME_SAMPLES, SAMPLE_RATE } from "./internal/pcm-queue.js";

/** A live stream of mono PCM frames, e.g. a Microphone from @kucukkanat/speech-audio. Assumed 16 kHz unless stated. */
export interface AudioStream extends AsyncIterable<Float32Array> {
  readonly sampleRate?: number;
}

/**
 * What can be transcribed: a finished recording (URL, File/Blob, bytes, PCM) or a live stream of frames (a
 * microphone, a WebRTC track you read yourself, a file you decode progressively…).
 */
export type TranscribeInput = AudioInput | AudioStream;

export const isStream = (input: TranscribeInput): input is AudioStream =>
  typeof input === "object" && !(input instanceof Blob) && Symbol.asyncIterator in input;

/** Turns any input into 16 kHz mono frames. Finite inputs are decoded, resampled and sliced into 80 ms frames. */
export async function* toFrames(input: TranscribeInput, signal?: AbortSignal): AsyncGenerator<Float32Array> {
  if (isStream(input)) {
    const rate = input.sampleRate ?? SAMPLE_RATE;
    for await (const frame of input) yield rate === SAMPLE_RATE ? frame : resample(frame, rate, SAMPLE_RATE);
    return;
  }
  const { pcm, sampleRate } = await decodeAudio(input, signal ? { signal } : {});
  const audio = resample(pcm, sampleRate, SAMPLE_RATE);
  for (let i = 0; i < audio.length; i += FRAME_SAMPLES) yield audio.slice(i, i + FRAME_SAMPLES);
}
