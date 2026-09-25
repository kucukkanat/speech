import { describe, expect, test } from "bun:test";
import { encodeWav } from "@kucukkanat/speech-audio";
import { isStream, toFrames } from "../src/input.js";
import { MoonshineStreamer, type MoonshineStreamerOptions } from "../src/internal/moonshine.js";
import { createPcmQueue, FRAME_SAMPLES, SAMPLE_RATE } from "../src/internal/pcm-queue.js";
import { joinText, type StreamUpdate } from "../src/internal/text.js";
import { EnergyVad } from "../src/internal/vad.js";

const FRAME_MS = (FRAME_SAMPLES / SAMPLE_RATE) * 1000; // 80 ms

/** A frame of "speech" (a loud tone, which is all an energy VAD looks at) or silence. */
const speech = () => Float32Array.from({ length: FRAME_SAMPLES }, (_, i) => 0.2 * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE));
const silence = () => new Float32Array(FRAME_SAMPLES);

/**
 * Drives a streamer with a simulated clock (80 ms per frame). The transcriber is plain logic standing in for the ASR
 * model: it names the utterance by its length, so segmentation is visible in the text.
 */
function drive(options: Partial<MoonshineStreamerOptions> = {}) {
  let clock = 0;
  const updates: StreamUpdate[] = [];
  const errors: unknown[] = [];
  const calls: number[] = [];
  const s = new MoonshineStreamer({
    transcribe: async (audio) => {
      calls.push(audio.length);
      return `[${Math.round((audio.length / SAMPLE_RATE) * 10) / 10}s]`;
    },
    onUpdate: (u) => updates.push(u),
    onError: (e) => errors.push(e),
    now: () => clock,
    ...options,
  });
  const feed = async (frames: Array<() => Float32Array>) => {
    for (const f of frames) {
      s.push(f());
      clock += FRAME_MS;
      await new Promise((r) => setTimeout(r, 1)); // let scheduled decodes run, like a live stream would
    }
  };
  return { s, feed, updates, errors, calls };
}

const repeat = (n: number, f: () => Float32Array) => Array.from({ length: n }, () => f);

describe("MoonshineStreamer", () => {
  test("commits one utterance per pause, with a little pre-roll and trailing silence trimmed", async () => {
    const { s, feed, updates } = drive();
    await feed([...repeat(5, silence), ...repeat(10, speech), ...repeat(10, silence), ...repeat(5, speech), ...repeat(10, silence)]);
    const final = await s.flush();
    // 0.8 s speech + 0.24 s pre-roll + 0.2 s kept silence ≈ 1.2 s; then 0.4 + 0.24 + 0.2 ≈ 0.8 s
    expect(final).toEqual({ committed: "[1.2s] [0.8s]", partial: "" });
    expect(updates.at(-1)).toEqual(final);
  });

  test("emits live partials while someone keeps talking", async () => {
    const { s, feed, updates } = drive({ partialIntervalMs: 350 });
    await feed(repeat(30, speech)); // 2.4 s without a pause
    const partials = updates.filter((u) => u.partial && !u.committed).map((u) => u.partial);
    expect(partials.length).toBeGreaterThanOrEqual(3);
    expect(new Set(partials).size).toBe(partials.length); // each one covers more audio
    await s.flush();
  });

  test("with partials disabled, only finished utterances are transcribed (file mode)", async () => {
    const { s, feed, calls } = drive({ partialIntervalMs: Number.POSITIVE_INFINITY });
    await feed([...repeat(30, speech), ...repeat(10, silence)]);
    await s.flush();
    expect(calls.length).toBe(1);
  });

  test("drops clicks shorter than the minimum speech length", async () => {
    const { s, feed, calls } = drive();
    await feed([...repeat(5, silence), ...repeat(2, speech), ...repeat(12, silence)]);
    expect(await s.flush()).toEqual({ committed: "", partial: "" });
    expect(calls.length).toBe(0);
  });

  test("force-commits very long utterances and uses shorter pauses once they are long", async () => {
    const { s, feed } = drive({ maxUtteranceMs: 2000, partialIntervalMs: Number.POSITIVE_INFINITY });
    await feed(repeat(40, speech)); // 3.2 s: forced commit at 2 s
    const text = (await s.flush()).committed;
    expect(text.split(" ").length).toBe(2);
  });

  test("flush finalises speech that is still going", async () => {
    const { s, feed } = drive();
    await feed(repeat(8, speech));
    expect((await s.flush()).committed).toMatch(/^\[\d/);
  });

  test("reports transcription failures and keeps going", async () => {
    let fail = true;
    const errors: unknown[] = [];
    const { s, feed } = drive({
      transcribe: async () => {
        if (fail) {
          fail = false;
          throw new Error("decoder hiccup");
        }
        return "recovered";
      },
      onError: (e) => errors.push(e),
      partialIntervalMs: Number.POSITIVE_INFINITY,
    });
    await feed([...repeat(6, speech), ...repeat(10, silence), ...repeat(6, speech), ...repeat(10, silence)]);
    expect((await s.flush()).committed).toBe("recovered");
    expect(errors.map((e) => (e as Error).message)).toEqual(["decoder hiccup"]);
  });

  test("reports failed partials too", async () => {
    const errors: unknown[] = [];
    const { s, feed } = drive({
      transcribe: async () => {
        throw new Error("partial failed");
      },
      onError: (e) => errors.push(e),
    });
    await feed(repeat(12, speech));
    await s.flush();
    expect(errors.length).toBeGreaterThan(0);
  });

  test("uses the wall clock by default", async () => {
    const s = new MoonshineStreamer({ transcribe: async () => "hi", onUpdate: () => undefined, onError: () => undefined });
    s.push(speech());
    expect(await s.flush()).toEqual({ committed: "", partial: "" }); // one frame is below the minimum speech length
  });

  test("flush and finals wait for a decode that is still running", async () => {
    let release: () => void = () => undefined;
    const slow = new Promise<void>((r) => {
      release = r;
    });
    const { s, feed } = drive({
      transcribe: async (audio) => {
        await slow; // the first (partial) decode is stuck until we release it
        return `${audio.length}`;
      },
    });
    await feed(repeat(12, speech)); // starts a partial that blocks
    await feed(repeat(10, silence)); // utterance ends while the partial is busy: the final must wait
    setTimeout(release, 30);
    expect((await s.flush()).committed).toMatch(/^\d+$/);
  });

  test("flush waits for a partial that started while frames kept arriving (live input during stop)", async () => {
    const { s, feed } = drive({
      transcribe: (audio) => new Promise((r) => setTimeout(() => r(`${audio.length}`), 20)),
    });
    await feed(repeat(6, speech));
    const flushed = s.flush(); // ends the utterance; its final decode is now queued
    await feed(repeat(40, speech)); // the microphone keeps delivering: after the final, a new utterance's partial starts
    expect((await flushed).committed).toMatch(/^\d+/);
  });

  test("text exposes the current state", async () => {
    const { s } = drive();
    expect(s.text).toEqual({ committed: "", partial: "" });
  });
});

describe("EnergyVad", () => {
  test("detects speech above an adaptive noise floor, with hysteresis", () => {
    const vad = new EnergyVad();
    for (let i = 0; i < 20; i++) expect(vad.process(0.002)).toBe(false); // quiet room
    expect(vad.process(0.05)).toBe(true); // speech
    expect(vad.process(0.009)).toBe(true); // softer, but above the "off" threshold while active
    expect(vad.process(0.001)).toBe(false);
    vad.reset();
    expect(vad.process(0.009)).toBe(false); // below the "on" threshold when starting fresh
  });

  test("adapts to steady background noise below the speech threshold", () => {
    const vad = new EnergyVad({ minSpeechRms: 0.001, ratio: 3 });
    expect(vad.process(0.02)).toBe(true); // speech against the initial, quiet floor
    vad.reset();
    for (let i = 0; i < 400; i++) vad.process(0.008); // a fan, just below the threshold, raises the floor slowly
    expect(vad.process(0.02)).toBe(false); // the same level is now too close to the background to count
  });
});

describe("PcmQueue", () => {
  test("slices by absolute index, zero-filling what isn't there", () => {
    const q = createPcmQueue();
    q.push(Float32Array.from([1, 2, 3]));
    expect(q.length).toBe(3);
    expect(Array.from(q.slice(1, 5))).toEqual([2, 3, 0, 0]);
    expect(q.slice(5, 3).length).toBe(0);
  });

  test("grows, trims old audio in large steps, and keeps indices stable", () => {
    const q = createPcmQueue();
    const big = new Float32Array(SAMPLE_RATE * 10).map((_, i) => i);
    q.push(big);
    q.trimBefore(SAMPLE_RATE); // less than 4 s: not worth moving memory yet
    expect(q.slice(0, 1)[0]).toBe(0);
    q.trimBefore(SAMPLE_RATE * 5);
    expect(q.slice(0, 1)[0]).toBe(0); // trimmed: reads as silence
    expect(q.slice(SAMPLE_RATE * 5, SAMPLE_RATE * 5 + 1)[0]).toBe(SAMPLE_RATE * 5);
    expect(q.length).toBe(SAMPLE_RATE * 10);
  });

  test("waitFor resolves when enough audio arrived or the queue closed; pushes after close are ignored", async () => {
    const q = createPcmQueue();
    await q.waitFor(0);
    const enough = q.waitFor(4);
    q.push(new Float32Array(2));
    q.push(new Float32Array(2));
    await enough;
    const never = q.waitFor(100);
    q.close();
    await never;
    expect(q.closed).toBe(true);
    q.push(new Float32Array(10));
    expect(q.length).toBe(4);
  });
});

describe("joinText", () => {
  test("joins with exactly one space and ignores empty parts", () => {
    expect(joinText("", " hello ")).toBe("hello");
    expect(joinText("hello", "   ")).toBe("hello");
    expect(joinText("hello", "world")).toBe("hello world");
    expect(joinText("hello ", "world")).toBe("hello world");
  });
});

describe("toFrames", () => {
  test("decodes, resamples to 16 kHz and slices recordings into 80 ms frames", async () => {
    const wav = encodeWav(new Float32Array(24000), 24000); // 1 s at 24 kHz
    const frames: Float32Array[] = [];
    for await (const f of toFrames(wav)) frames.push(f);
    expect(frames.length).toBe(13); // 16000 / 1280 = 12.5 → 12 full frames + a half one
    expect(frames[0]?.length).toBe(FRAME_SAMPLES);
    expect(frames.at(-1)?.length).toBe(640);
  });

  test("passes 16 kHz streams through and resamples others", async () => {
    async function* gen(n: number) {
      yield new Float32Array(n);
    }
    const same: number[] = [];
    for await (const f of toFrames(gen(1280))) same.push(f.length);
    const resampled: number[] = [];
    for await (const f of toFrames(Object.assign(gen(4800), { sampleRate: 48000 }))) resampled.push(f.length);
    expect(same).toEqual([1280]);
    expect(resampled).toEqual([1600]);
  });

  test("honours an abort signal when fetching a recording", async () => {
    const it = toFrames("http://localhost:1/never.wav", AbortSignal.abort());
    await expect(it.next()).rejects.toThrow();
  });

  test("isStream tells recordings from live streams", () => {
    expect(isStream(new Blob([]))).toBe(false);
    expect(isStream("x.wav")).toBe(false);
    expect(isStream({ pcm: new Float32Array(1), sampleRate: 16000 })).toBe(false);
    expect(isStream({ async *[Symbol.asyncIterator]() {} })).toBe(true);
  });
});
