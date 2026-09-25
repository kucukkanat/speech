import { type AudioInput, decodeAudio } from "@kucukkanat/speech-audio";
import type { ConditioningCache, PcmAudio, SpeakerConditioning } from "@kucukkanat/speech-core";

/**
 * A voice with a stable identity. Anything shaped `{ id, audio }` works — for example a record from
 * `@kucukkanat/voices` — and `audio` is only decoded when the voice isn't encoded (cached) yet.
 */
export interface VoiceSource {
  readonly id: string;
  readonly audio: AudioInput;
}

/** A reference recording to clone (5–15 s of clean speech works best): a URL, file, PCM, or a {@link VoiceSource}. */
export type VoiceInput = string | URL | Blob | PcmAudio | VoiceSource;

/** Bump when the worker's encoding changes, so caches holding old conditioning are ignored. */
export const CONDITIONING_VERSION = 1;

/** Used when you don't pass a voice: the reference speaker shipped with the Chatterbox model (MIT). */
export const DEFAULT_VOICE_PATH = "onnx-community/chatterbox-ONNX/resolve/main/default_voice.wav";

const isSource = (v: VoiceInput): v is VoiceSource => typeof v === "object" && "id" in v && "audio" in v;
const isPcm = (v: VoiceInput): v is PcmAudio => typeof v === "object" && "pcm" in v && "sampleRate" in v;

const ids = new WeakMap<object, Promise<string>>();

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>));
  return Array.from(digest.subarray(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * A stable identity for a voice, used as its cache key. URLs are identified by address (no download needed to hit
 * the cache); Blobs and PCM by a content hash, so the same recording is recognised across reloads.
 */
export function voiceId(voice: VoiceInput): Promise<string> {
  if (isSource(voice)) return Promise.resolve(voice.id);
  if (typeof voice === "string" || voice instanceof URL) return Promise.resolve(`url:${String(voice)}`);
  const key = isPcm(voice) ? voice.pcm : voice;
  let id = ids.get(key);
  if (!id) {
    id = isPcm(voice)
      ? sha256(new Uint8Array(voice.pcm.buffer, voice.pcm.byteOffset, voice.pcm.byteLength)).then((h) => `pcm:${voice.sampleRate}:${h}`)
      : voice
          .arrayBuffer()
          .then((b) => sha256(new Uint8Array(b)))
          .then((h) => `blob:${h}`);
    ids.set(key, id);
  }
  return id;
}

/** Decodes a voice's reference audio. */
export function voiceAudio(voice: VoiceInput, signal?: AbortSignal): Promise<PcmAudio> {
  return decodeAudio(isSource(voice) ? voice.audio : voice, signal ? { signal } : {});
}

export const conditioningKey = (voiceIdentity: string, modelRepo: string): string =>
  `${voiceIdentity}|${modelRepo}|v${CONDITIONING_VERSION}`;

/** The default cache: the most recently used encoded voices, in memory for this page's lifetime. */
export function createMemoryCache(capacity = 16): ConditioningCache {
  const entries = new Map<string, SpeakerConditioning>();
  return {
    get: async (key) => {
      const hit = entries.get(key);
      if (hit) {
        // Refresh recency: Map iteration order is insertion order, so re-insert at the end.
        entries.delete(key);
        entries.set(key, hit);
      }
      return hit;
    },
    set: async (key, value) => {
      entries.delete(key);
      entries.set(key, value);
      const oldest = entries.keys().next();
      if (entries.size > capacity && !oldest.done) entries.delete(oldest.value);
    },
  };
}
