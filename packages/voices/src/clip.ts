import { type AudioInput, decodeAudio, encodeWav, resample } from "@kucukkanat/speech-audio";

/** Voice clips are stored as 24 kHz mono (Chatterbox's native rate). */
export const CLIP_SAMPLE_RATE = 24_000;
/** Reference clips: 5–10 s of clean speech is ideal, 3–15 s works. */
export const CLIP_SECONDS = { min: 3, idealMin: 5, idealMax: 10, max: 15 } as const;

/** Min/max pairs per bucket for drawing a waveform (`buckets * 2` values). */
export function computePeaks(pcm: Float32Array, buckets: number): Float32Array {
  const out = new Float32Array(buckets * 2);
  const step = pcm.length / buckets;
  for (let b = 0; b < buckets; b++) {
    let min = 0;
    let max = 0;
    // A loop, not Math.min(...slice): spreading a long bucket overflows the call stack.
    for (const x of pcm.subarray(Math.floor(b * step), Math.max(Math.floor(b * step) + 1, Math.floor((b + 1) * step)))) {
      if (x < min) min = x;
      if (x > max) max = x;
    }
    out[b * 2] = min;
    out[b * 2 + 1] = max;
  }
  return out;
}

/** The most energetic `seconds`-long window: a good default crop (speech, not silence). */
export function bestWindow(pcm: Float32Array, sampleRate: number, seconds: number): { start: number; end: number } {
  const duration = pcm.length / sampleRate;
  if (duration <= seconds) return { start: 0, end: duration };
  const hop = Math.floor(sampleRate * 0.1);
  const frames = Math.floor(pcm.length / hop);
  // Prefix sums of per-hop energy make every window sum O(1).
  const energy = new Float64Array(frames + 1);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (const x of pcm.subarray(f * hop, (f + 1) * hop)) sum += x * x;
    energy[f + 1] = (energy[f] ?? 0) + sum;
  }
  const win = Math.floor((seconds * sampleRate) / hop);
  let best = 0;
  let bestEnergy = -1;
  for (let f = 0; f + win <= frames; f++) {
    const e = (energy[f + win] ?? 0) - (energy[f] ?? 0);
    if (e > bestEnergy) {
      bestEnergy = e;
      best = f;
    }
  }
  const start = (best * hop) / sampleRate;
  return { start, end: Math.min(duration, start + seconds) };
}

/** Moves a time (seconds) to the nearest zero crossing within ±maxMs, so cuts don't click. */
export function snapToZero(pcm: Float32Array, sampleRate: number, t: number, maxMs = 8): number {
  const i0 = Math.round(t * sampleRate);
  const r = Math.floor((maxMs / 1000) * sampleRate);
  for (let d = 0; d <= r; d++) {
    for (const i of [i0 - d, i0 + d]) {
      const a = pcm[i - 1];
      const b = pcm[i];
      if (a === undefined || b === undefined) continue;
      if ((a <= 0 && b >= 0) || (a >= 0 && b <= 0)) return i / sampleRate;
    }
  }
  return t;
}

/** Raises quiet recordings to ~-1 dBFS peak (at most 8× gain) so the model gets a usable reference. */
export function normalizePeak(pcm: Float32Array, target = 0.89): Float32Array {
  const peak = pcm.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  if (peak < 1e-4 || peak > target) return pcm;
  const gain = Math.min(8, target / peak);
  return pcm.map((x) => x * gain);
}

export interface PreparedClip {
  /** 24 kHz mono PCM */
  pcm: Float32Array;
  /** The same audio as a 16-bit WAV file */
  wav: Blob;
  seconds: number;
}

export interface PrepareOptions {
  /**
   * Which part of the recording to keep, in seconds. "auto" (default) picks the most energetic stretch of up to
   * {@link CLIP_SECONDS}.idealMax seconds; `false` keeps everything up to `maxSeconds`.
   */
  crop?: "auto" | false | { start: number; end: number };
  /** Hard limit on the clip length. Default {@link CLIP_SECONDS}.max. */
  maxSeconds?: number;
  signal?: AbortSignal;
}

/** Turns any recording into a reference clip: crop → zero-crossing cuts → peak normalise → 24 kHz WAV. */
export async function prepareClip(input: AudioInput, options: PrepareOptions = {}): Promise<PreparedClip> {
  const { crop = "auto", maxSeconds = CLIP_SECONDS.max, signal } = options;
  const { pcm, sampleRate } = await decodeAudio(input, signal ? { signal } : {});
  const window =
    crop === "auto"
      ? bestWindow(pcm, sampleRate, Math.min(CLIP_SECONDS.idealMax, maxSeconds))
      : crop === false
        ? { start: 0, end: pcm.length / sampleRate }
        : crop;
  const start = snapToZero(pcm, sampleRate, Math.max(0, window.start));
  const end = snapToZero(pcm, sampleRate, Math.min(window.end, window.start + maxSeconds, pcm.length / sampleRate));
  const cut = normalizePeak(pcm.subarray(Math.round(start * sampleRate), Math.round(end * sampleRate)));
  const pcm24 = resample(cut, sampleRate, CLIP_SAMPLE_RATE);
  return { pcm: pcm24, wav: encodeWav(pcm24, CLIP_SAMPLE_RATE), seconds: pcm24.length / CLIP_SAMPLE_RATE };
}
