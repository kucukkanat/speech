import { type PcmAudio, SpeechError } from "@kucukkanat/speech-core";
import { decodeWithWebAudio } from "./decode.browser.js";
import { decodeWav, isWav } from "./wav.js";

/** Anything audio can be loaded from. Strings and URLs are fetched. */
export type AudioInput = Blob | ArrayBuffer | Uint8Array | string | URL | PcmAudio;

const isPcm = (x: AudioInput): x is PcmAudio => typeof x === "object" && "pcm" in x && "sampleRate" in x;

/** Reads raw bytes from any non-PCM input. */
export async function readBytes(input: Exclude<AudioInput, PcmAudio>, signal?: AbortSignal): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (input instanceof Blob) return new Uint8Array(await input.arrayBuffer());
  const res = await fetch(input, signal ? { signal } : {});
  if (!res.ok) throw new SpeechError("decode-failed", `Could not fetch audio from ${String(input)} (HTTP ${res.status}).`);
  // SPA dev servers answer unknown paths with index.html; catch that instead of failing inside the decoder.
  if (res.headers.get("content-type")?.includes("text/html")) {
    throw new SpeechError("decode-failed", `${String(input)} returned an HTML page, not audio. Is the path right?`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Decodes any browser-supported audio (wav/mp3/ogg/webm/m4a…) to mono PCM at its native sample rate. WAV files are
 * parsed directly (works in workers, Node and Bun too); other formats need Web Audio.
 */
export async function decodeAudio(input: AudioInput, options: { signal?: AbortSignal } = {}): Promise<PcmAudio> {
  if (isPcm(input)) return input;
  const bytes = await readBytes(input, options.signal);
  return isWav(bytes) ? decodeWav(bytes) : decodeWithWebAudio(bytes);
}
