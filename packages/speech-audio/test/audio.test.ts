import { afterAll, describe, expect, test } from "bun:test";
import { isSpeechError } from "@kucukkanat/speech-core";
import { createDownsampler, decodeAudio, decodeWav, downmix, encodeWav, isWav, resample, rms } from "../src/index.js";
import { assertMicSupported, toMicError } from "../src/mic-errors.js";

const sine = (hz: number, rate: number, seconds: number, amp = 0.5) =>
  Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate));

/** Builds a WAV by hand (independent of encodeWav) so decoding is checked against the spec, not our own writer. */
function wav({ rate, channels, float }: { rate: number; channels: number[][]; float: boolean }): Uint8Array {
  const frames = channels[0]?.length ?? 0;
  const width = float ? 4 : 2;
  const data = frames * channels.length * width;
  const v = new DataView(new ArrayBuffer(44 + 10 + data));
  const tag = (o: number, s: string) => {
    for (const [i, c] of [...s].entries()) v.setUint8(o + i, c.charCodeAt(0));
  };
  tag(0, "RIFF");
  v.setUint32(4, 46 + data, true);
  tag(8, "WAVE");
  tag(12, "LIST"); // an unrelated odd-sized chunk before fmt, to exercise chunk skipping + word alignment
  v.setUint32(16, 1, true);
  tag(22, "fmt ");
  v.setUint32(26, 16, true);
  v.setUint16(30, float ? 3 : 1, true);
  v.setUint16(32, channels.length, true);
  v.setUint32(34, rate, true);
  v.setUint32(38, rate * channels.length * width, true);
  v.setUint16(42, channels.length * width, true);
  v.setUint16(44, width * 8, true);
  tag(46, "data");
  v.setUint32(50, data, true);
  for (let f = 0; f < frames; f++) {
    channels.forEach((ch, c) => {
      const at = 54 + (f * channels.length + c) * width;
      const x = ch[f] ?? 0;
      if (float) v.setFloat32(at, x, true);
      else v.setInt16(at, Math.round(x * 32767), true);
    });
  }
  return new Uint8Array(v.buffer);
}

describe("WAV", () => {
  test("encodeWav → decodeWav round-trips mono 16-bit audio", async () => {
    const pcm = sine(440, 24000, 0.1);
    const blob = encodeWav(pcm, 24000);
    expect(blob.type).toBe("audio/wav");
    const out = decodeWav(new Uint8Array(await blob.arrayBuffer()));
    expect(out.sampleRate).toBe(24000);
    expect(out.pcm.length).toBe(pcm.length);
    for (const [i, x] of out.pcm.entries()) expect(Math.abs(x - (pcm[i] ?? 0))).toBeLessThan(1e-4);
  });

  test("encodeWav clips out-of-range samples", async () => {
    const out = decodeWav(new Uint8Array(await encodeWav(Float32Array.from([2, -2]), 8000).arrayBuffer()));
    expect(out.pcm[0]).toBeCloseTo(1, 3);
    expect(out.pcm[1]).toBe(-1);
  });

  test("decodes 32-bit float stereo by averaging channels, skipping unknown chunks", () => {
    const out = decodeWav(
      wav({
        rate: 16000,
        channels: [
          [0.5, 1],
          [-0.5, 0],
        ],
        float: true,
      }),
    );
    expect(out).toEqual({ pcm: Float32Array.from([0, 0.5]), sampleRate: 16000 });
  });

  test("decodes 16-bit PCM written by another encoder", () => {
    const out = decodeWav(wav({ rate: 22050, channels: [[0.25, -0.25]], float: false }));
    expect(out.sampleRate).toBe(22050);
    expect(out.pcm[0]).toBeCloseTo(0.25, 3);
    expect(out.pcm[1]).toBeCloseTo(-0.25, 3);
  });

  test("rejects non-WAV data, unsupported encodings and broken files with decode-failed", () => {
    const expectCode = (f: () => unknown) => {
      try {
        f();
        throw new Error("expected a throw");
      } catch (e) {
        expect(isSpeechError(e, "decode-failed")).toBe(true);
      }
    };
    expectCode(() => decodeWav(new TextEncoder().encode("ID3 not a wav at all")));
    const pcm8 = wav({ rate: 8000, channels: [[0]], float: false });
    new DataView(pcm8.buffer).setUint16(44, 8, true); // claim 8-bit
    expectCode(() => decodeWav(pcm8));
    const noData = wav({ rate: 8000, channels: [[]], float: false }).slice(0, 46); // cut before the data chunk
    expectCode(() => decodeWav(noData));
    const dataFirst = new Uint8Array(20);
    dataFirst.set(new TextEncoder().encode("RIFF\0\0\0\0WAVEdata"));
    expectCode(() => decodeWav(dataFirst));
  });

  test("isWav checks the RIFF/WAVE header", () => {
    expect(isWav(new TextEncoder().encode("RIFF\0\0\0\0WAVE"))).toBe(true);
    expect(isWav(new TextEncoder().encode("RIFF"))).toBe(false);
  });
});

describe("resample", () => {
  test("is an identity copy at equal rates", () => {
    const pcm = sine(100, 16000, 0.01);
    const out = resample(pcm, 16000, 16000);
    expect(out).toEqual(pcm);
    expect(out).not.toBe(pcm);
  });

  test("keeps a pure tone's frequency and level when downsampling", () => {
    const out = resample(sine(440, 48000, 0.5), 48000, 16000);
    expect(out.length).toBe(8000);
    // Compare the middle (edges see zero padding) against an ideal 16 kHz tone.
    const ideal = sine(440, 16000, 0.5);
    const mid = (a: Float32Array) => a.subarray(1000, 7000);
    const err = rms(mid(out).map((x, i) => x - (mid(ideal)[i] ?? 0)));
    expect(err).toBeLessThan(0.01);
  });

  test("removes content above the new Nyquist frequency (anti-aliasing)", () => {
    const out = resample(sine(12000, 48000, 0.5), 48000, 16000); // 12 kHz can't exist at 16 kHz
    expect(rms(out.subarray(1000, 7000))).toBeLessThan(0.01);
  });

  test("upsamples to the right length", () => {
    expect(resample(sine(100, 16000, 0.1), 16000, 24000).length).toBe(2400);
  });
});

describe("helpers", () => {
  test("rms", () => {
    expect(rms(new Float32Array(0))).toBe(0);
    expect(rms(Float32Array.from([1, -1, 1, -1]))).toBe(1);
    expect(rms(sine(50, 8000, 1, 1))).toBeCloseTo(Math.SQRT1_2, 3);
  });

  test("downmix averages channels and copies mono", () => {
    expect(downmix([])).toEqual(new Float32Array(0));
    const mono = Float32Array.from([1, 2]);
    expect(downmix([mono])).toEqual(mono);
    expect(downmix([mono])).not.toBe(mono);
    expect(downmix([Float32Array.from([1, 0]), Float32Array.from([0, 1])])).toEqual(Float32Array.from([0.5, 0.5]));
  });
});

describe("createDownsampler (the microphone worklet's core)", () => {
  test("emits complete frames at the output rate, carrying partial frames across quanta", () => {
    const down = createDownsampler({ inRate: 48000, outRate: 16000, frameSize: 160 });
    const input = sine(300, 48000, 0.1);
    const frames: Float32Array[] = [];
    for (let i = 0; i < input.length; i += 128) frames.push(...down([input.subarray(i, i + 128)])); // 128 = render quantum
    expect(frames.length).toBe(10); // 0.1 s @ 16 kHz = 1600 samples = 10 frames of 160
    const joined = new Float32Array(1600);
    for (const [i, f] of frames.entries()) joined.set(f, i * 160);
    expect(rms(joined)).toBeCloseTo(rms(input), 2); // a 300 Hz tone passes the box filter unchanged in level
  });

  test("handles non-integer ratios (44.1 kHz → 16 kHz) without drift", () => {
    const down = createDownsampler({ inRate: 44100, outRate: 16000, frameSize: 1600 });
    const frames = down([sine(200, 44100, 1)]);
    expect(frames.length).toBe(10); // exactly 16000 samples out of 44100 in
  });

  test("mixes channels to mono and ignores empty input", () => {
    const down = createDownsampler({ inRate: 16000, outRate: 16000, frameSize: 2 });
    expect(down([])).toEqual([]);
    expect(down([Float32Array.from([1, 1]), Float32Array.from([0, 0])])).toEqual([Float32Array.from([0.5, 0.5])]);
  });
});

describe("decodeAudio", () => {
  const clip = encodeWav(sine(440, 16000, 0.05), 16000);
  const server = Bun.serve({
    port: 0,
    fetch: (req) => {
      const path = new URL(req.url).pathname;
      if (path === "/clip.wav") return new Response(clip);
      if (path === "/spa-fallback.wav") return new Response("<!doctype html>", { headers: { "content-type": "text/html" } });
      return new Response("missing", { status: 404 });
    },
  });
  afterAll(() => server.stop(true));

  test("accepts PCM, bytes, ArrayBuffers, Blobs, URL strings and URL objects", async () => {
    const pcm = { pcm: Float32Array.from([0.1]), sampleRate: 8000 };
    expect(await decodeAudio(pcm)).toBe(pcm);
    const bytes = new Uint8Array(await clip.arrayBuffer());
    for (const input of [bytes, bytes.buffer, clip, `${server.url}clip.wav`, new URL("clip.wav", server.url)]) {
      const out = await decodeAudio(input);
      expect(out.sampleRate).toBe(16000);
      expect(out.pcm.length).toBe(800);
    }
  });

  test("explains HTTP errors and SPA index.html fallbacks", async () => {
    const err404 = await decodeAudio(`${server.url}nope.wav`).catch((e: unknown) => e);
    expect(isSpeechError(err404, "decode-failed")).toBe(true);
    expect((err404 as Error).message).toContain("HTTP 404");
    const errHtml = await decodeAudio(`${server.url}spa-fallback.wav`).catch((e: unknown) => e);
    expect((errHtml as Error).message).toContain("HTML page");
  });

  test("honours an abort signal while fetching", async () => {
    await expect(decodeAudio(`${server.url}clip.wav`, { signal: AbortSignal.abort() })).rejects.toThrow();
  });

  test("needs Web Audio for compressed formats", async () => {
    const err = await decodeAudio(new TextEncoder().encode("OggS fake ogg")).catch((e: unknown) => e);
    expect(isSpeechError(err, "unsupported-environment")).toBe(true);
  });
});

describe("microphone errors", () => {
  test("map getUserMedia failures to typed codes with user-facing messages", () => {
    const cases: Array<[string, string]> = [
      ["NotAllowedError", "mic-permission-denied"],
      ["SecurityError", "mic-permission-denied"],
      ["NotFoundError", "mic-not-found"],
      ["OverconstrainedError", "mic-not-found"],
      ["NotReadableError", "mic-busy"],
      ["AbortError", "mic-busy"],
      ["WeirdError", "mic-unknown"],
    ];
    for (const [name, code] of cases) {
      const err = toMicError(new DOMException("x", name));
      expect(err.code).toBe(code as typeof err.code);
      expect(err.message.length).toBeGreaterThan(10);
    }
    expect(toMicError("just a string").message).toContain("just a string");
  });

  test("reject environments that can never capture", () => {
    expect(() => assertMicSupported({ isSecureContext: false, hasGetUserMedia: true, hasAudioWorklet: true })).toThrow("secure context");
    expect(() => assertMicSupported({ isSecureContext: true, hasGetUserMedia: false, hasAudioWorklet: true })).toThrow("cannot capture");
    expect(() => assertMicSupported({ hasGetUserMedia: true, hasAudioWorklet: true })).not.toThrow();
  });
});
