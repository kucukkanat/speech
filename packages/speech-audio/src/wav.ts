// Pure-JS audio helpers: safe in windows, workers, Node and Bun (no Web Audio needed).

import { type PcmAudio, SpeechError } from "@kucukkanat/speech-core";

/** Encodes mono float PCM as a 16-bit PCM WAV file. */
export function encodeWav(pcm: Float32Array, sampleRate: number): Blob {
  const bytes = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(bytes);
  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(offset + i, s.charCodeAt(i));
  };
  ascii(0, "RIFF");
  v.setUint32(4, 36 + pcm.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, "data");
  v.setUint32(40, pcm.length * 2, true);
  pcm.forEach((x, i) => {
    const s = Math.max(-1, Math.min(1, x));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  });
  return new Blob([bytes], { type: "audio/wav" });
}

/** True if `bytes` start with a RIFF/WAVE header. */
export function isWav(bytes: Uint8Array): boolean {
  const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  return bytes.length >= 12 && tag(0) === "RIFF" && tag(8) === "WAVE";
}

/** Decodes 16-bit integer or 32-bit float PCM WAV to mono (channels are averaged). */
export function decodeWav(bytes: Uint8Array): PcmAudio {
  if (!isWav(bytes)) throw new SpeechError("decode-failed", "Not a WAV file (missing RIFF/WAVE header).");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let format: { tag: number; channels: number; sampleRate: number; bits: number } | undefined;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const size = v.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      format = {
        tag: v.getUint16(body, true),
        channels: v.getUint16(body + 2, true),
        sampleRate: v.getUint32(body + 4, true),
        bits: v.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      if (!format) throw new SpeechError("decode-failed", "WAV data chunk appears before its format chunk.");
      const { tag, channels, sampleRate, bits } = format;
      const float = tag === 3 && bits === 32;
      if (!float && !(tag === 1 && bits === 16)) {
        throw new SpeechError("decode-failed", `Unsupported WAV encoding (format ${tag}, ${bits}-bit); use 16-bit PCM or 32-bit float.`);
      }
      const width = bits / 8;
      const frames = Math.floor(Math.min(size, bytes.length - body) / (width * channels));
      const pcm = new Float32Array(frames);
      for (let f = 0; f < frames; f++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) {
          const at = body + (f * channels + c) * width;
          sum += float ? v.getFloat32(at, true) : v.getInt16(at, true) / 32768;
        }
        pcm[f] = sum / channels;
      }
      return { pcm, sampleRate };
    }
    offset = body + size + (size % 2); // chunks are word-aligned
  }
  throw new SpeechError("decode-failed", "WAV file has no audio data.");
}

/** Averages channels into one. */
export function downmix(channels: readonly Float32Array[]): Float32Array {
  const [first, ...rest] = channels;
  if (!first) return new Float32Array(0);
  if (!rest.length) return first.slice();
  return first.map((x, i) => rest.reduce((sum, ch) => sum + (ch[i] ?? 0), x) / channels.length);
}

/**
 * Windowed-sinc resampler (Blackman-Harris, 32 zero-crossings). Band-limited: when downsampling the cutoff drops to
 * the target Nyquist, so it doubles as the anti-alias filter. Pure JS, so it works in workers too.
 */
export function resample(pcm: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return pcm.slice();
  const ratio = to / from;
  const out = new Float32Array(Math.max(1, Math.round(pcm.length * ratio)));
  const cutoff = Math.min(1, ratio) * 0.97; // fraction of the source Nyquist
  const half = Math.ceil(32 / cutoff);
  for (let i = 0; i < out.length; i++) {
    const t = i / ratio;
    const c = Math.floor(t);
    let acc = 0;
    let weights = 0;
    for (let j = c - half + 1; j <= c + half; j++) {
      const x = t - j;
      const ax = Math.abs(x) / half;
      if (ax >= 1) continue;
      const p = Math.PI * (ax + 1); // Blackman-Harris over [-half, half]
      const w = 0.35875 - 0.48829 * Math.cos(p) + 0.14128 * Math.cos(2 * p) - 0.01168 * Math.cos(3 * p);
      const arg = Math.PI * x * cutoff;
      const k = (arg === 0 ? 1 : Math.sin(arg) / arg) * w * cutoff;
      weights += k;
      acc += (pcm[j] ?? 0) * k; // outside the signal counts as silence
    }
    out[i] = weights > 0 ? acc / weights : 0; // unity DC gain
  }
  return out;
}

/** Root-mean-square level of a block of samples (0 for an empty block). */
export function rms(pcm: Float32Array): number {
  if (!pcm.length) return 0;
  let s = 0;
  for (const x of pcm) s += x * x;
  return Math.sqrt(s / pcm.length);
}
