// fake-indexeddb is a complete in-memory IndexedDB (it passes the W3C web-platform tests), not a mock; real browser
// storage is covered by the E2E suite.
import "fake-indexeddb/auto";
import { describe, expect, test } from "bun:test";
import { decodeWav, encodeWav } from "@kucukkanat/speech-audio";
import { isSpeechError } from "@kucukkanat/speech-core";
import { openDB } from "idb";
import {
  bestWindow,
  CLIP_SAMPLE_RATE,
  computePeaks,
  createVoiceStore,
  DEMO_VOICES,
  normalizePeak,
  prepareClip,
  snapToZero,
} from "../src/index.js";
import { toSpeechError } from "../src/store.js";

let dbCounter = 0;
const freshName = () => `test-voices-${++dbCounter}`;

/** 1 s of quiet noise, then `loud` seconds of a louder tone, then 1 s of quiet: a recording with an obvious "speech" part. */
function recording(rate: number, loud: number): Float32Array {
  const quiet = (n: number) => Float32Array.from({ length: n }, () => (Math.random() - 0.5) * 0.002);
  const tone = Float32Array.from({ length: Math.round(rate * loud) }, (_, i) => 0.3 * Math.sin((2 * Math.PI * 200 * i) / rate));
  const out = new Float32Array(rate * 2 + tone.length);
  out.set(quiet(rate));
  out.set(tone, rate);
  out.set(quiet(rate), rate + tone.length);
  return out;
}

const code = (p: Promise<unknown>) =>
  p.then(
    () => "resolved",
    (e: unknown) => (isSpeechError(e) ? e.code : String(e)),
  );

describe("createVoiceStore", () => {
  test("seeds the bundled demo voices once, with your metadata", async () => {
    const name = freshName();
    const voices = createVoiceStore<{ emoji: string }>({ name, demoVoices: (demo) => ({ emoji: demo.name === "Aria" ? "🌅" : "🌌" }) });
    expect(voices.snapshot.loading).toBe(true);
    await voices.ready;
    const list = await voices.list();
    expect(list.map((v) => [v.id, v.name, v.meta.emoji, v.builtIn])).toEqual([
      ["builtin-aria", "Aria", "🌅", true],
      ["builtin-orion", "Orion", "🌌", true],
    ]);
    expect(list[0]?.seconds).toBeGreaterThan(5);
    expect(voices.snapshot).toMatchObject({ loading: false, error: null });
    voices.close();
    const again = createVoiceStore<{ emoji: string }>({ name, demoVoices: () => ({ emoji: "?" }) });
    expect((await again.list()).map((v) => v.meta.emoji)).toEqual(["🌅", "🌌"]); // not re-seeded
    again.close();
  });

  test("works with no generic and no options (empty metadata, demo voices included)", async () => {
    const voices = createVoiceStore({ name: freshName() });
    expect((await voices.list()).map((v) => v.meta)).toEqual([{}, {}]);
    voices.close();
  });

  test("create → get → update → remove, with voices ordered demos first then newest first", async () => {
    const voices = createVoiceStore<{ tag: string }>({ name: freshName(), demoVoices: false });
    const events: number[] = [];
    voices.subscribe((s) => events.push(s.voices.length));
    await voices.ready;
    // 14 s: 1 s quiet, 12 s "speech", 1 s quiet — at the clip rate, so the test measures the store, not resampling.
    const audio = encodeWav(recording(24000, 12), 24000);
    const a = await voices.create({ name: "A", audio, meta: { tag: "first" } });
    await new Promise((r) => setTimeout(r, 2)); // distinct createdAt
    const b = await voices.create({ name: "B", audio, meta: { tag: "second" }, crop: false });
    expect((await voices.list()).map((v) => v.name)).toEqual(["B", "A"]);
    expect(a.builtIn).toBe(false);
    expect(a.seconds).toBeCloseTo(10, 0); // auto-crop: the loudest 10 s (the ideal maximum)
    expect(b.seconds).toBeCloseTo(14, 0); // crop: false kept everything (under the 15 s limit)
    expect(decodeWav(new Uint8Array(await a.audio.arrayBuffer())).sampleRate).toBe(CLIP_SAMPLE_RATE);
    expect(await voices.get(a.id)).toEqual(a);
    const renamed = await voices.update(a.id, { name: "A2", meta: { tag: "edited" } });
    expect(renamed).toMatchObject({ id: a.id, name: "A2", meta: { tag: "edited" } });
    const removed = await voices.remove(b.id);
    expect((await voices.list()).map((v) => v.name)).toEqual(["A2"]);
    expect(await voices.restore(removed)).toEqual(b); // undo: same id, same audio
    expect((await voices.list()).map((v) => v.name)).toEqual(["B", "A2"]);
    await voices.remove(b.id);
    expect(events.at(-1)).toBe(1);
    voices.close();
  });

  test("typed errors for missing voices and built-ins", async () => {
    const voices = createVoiceStore({ name: freshName() });
    await voices.ready;
    expect(await code(voices.update("nope", { name: "x" }))).toBe("voice-not-found");
    expect(await code(voices.remove("nope"))).toBe("voice-not-found");
    expect(await code(voices.remove("builtin-aria"))).toBe("built-in-read-only");
    expect(await code(voices.create({ name: "bad", audio: new TextEncoder().encode("not audio"), meta: {} }))).toBe(
      "unsupported-environment",
    );
    voices.close();
  });

  test("the conditioning cache persists, and removing a voice drops only its encodings", async () => {
    const name = freshName();
    const voices = createVoiceStore({ name, demoVoices: false });
    const mine = await voices.create({ name: "Me", audio: encodeWav(recording(24000, 3), 24000), meta: {} });
    const cond = (modelId: string) => ({ modelId, tensors: { x: { dims: [1], type: "float32", data: new Float32Array([1]).buffer } } });
    await voices.conditioningCache.set(`${mine.id}|turbo|v1`, cond("turbo"));
    await voices.conditioningCache.set(`${mine.id}|original|v1`, cond("original"));
    await voices.conditioningCache.set("builtin-aria|turbo|v1", cond("aria"));
    voices.close();
    const reopened = createVoiceStore({ name, demoVoices: false });
    expect((await reopened.conditioningCache.get(`${mine.id}|turbo|v1`))?.modelId).toBe("turbo");
    await reopened.remove(mine.id);
    expect(await reopened.conditioningCache.get(`${mine.id}|turbo|v1`)).toBeUndefined();
    expect(await reopened.conditioningCache.get(`${mine.id}|original|v1`)).toBeUndefined();
    expect((await reopened.conditioningCache.get("builtin-aria|turbo|v1"))?.modelId).toBe("aria");
    reopened.close();
  });

  test("a demo voice that can't be loaded is reported, without hiding the others", async () => {
    const voices = createVoiceStore({
      name: freshName(),
      demos: [{ id: "broken", name: "Broken", url: new URL("./does-not-exist.wav", import.meta.url), transcript: "" }, ...DEMO_VOICES],
    });
    expect(await code(voices.ready)).toBe("decode-failed");
    expect(voices.snapshot.error?.message).toContain("Broken");
    expect(await voices.list()).toEqual([]); // seeding stops at the first failure; nothing half-written
    voices.close();
  });

  test("migrates the Voice Lab v1 'personas' store in place", async () => {
    const name = freshName();
    const clip = encodeWav(recording(24000, 2), 24000);
    const legacy = await openDB(name, 1, {
      upgrade: (db) => db.createObjectStore("personas", { keyPath: "id" }).createIndex("by-created", "createdAt"),
    });
    await legacy.put("personas", {
      id: "builtin-aria",
      name: "Aria",
      colors: ["#f00", "#0f0"],
      emoji: "🌅",
      builtIn: true,
      createdAt: 0,
      clip,
      clipSeconds: 4,
    });
    await legacy.put("personas", {
      id: "p-1",
      name: "Mine",
      colors: ["#00f", "#fff"],
      builtIn: false,
      createdAt: 5,
      clip,
      clipSeconds: 4,
      conditioning: { modelId: "x", tensors: {} },
    });
    legacy.close();

    const voices = createVoiceStore<{ colors: [string, string]; emoji?: string }>({
      name,
      demoVoices: () => ({ colors: ["#000", "#000"] }),
    });
    const list = await voices.list();
    expect(list.map((v) => [v.id, v.name, v.meta, v.seconds])).toEqual([
      ["builtin-aria", "Aria", { colors: ["#f00", "#0f0"], emoji: "🌅" }, 4],
      ["builtin-orion", "Orion", { colors: ["#000", "#000"] }, expect.any(Number)], // seeded: wasn't in the old DB
      ["p-1", "Mine", { colors: ["#00f", "#fff"] }, 4],
    ]);
    expect((await voices.get("p-1"))?.audio.size).toBe(clip.size);
    voices.close();
    const db = await openDB(name);
    expect([...db.objectStoreNames].sort()).toEqual(["conditioning", "voices"]);
    db.close();
  });

  test("reports an upgrade blocked by another open connection, and recovers when it closes", async () => {
    const name = freshName();
    const old = await openDB(name, 1, { upgrade: (db) => db.createObjectStore("personas", { keyPath: "id" }) });
    const voices = createVoiceStore({ name, demoVoices: false });
    await new Promise((r) => setTimeout(r, 20));
    expect(voices.snapshot.error?.code).toBe("db-blocked");
    old.close();
    await voices.ready;
    expect(voices.snapshot.error).toBeNull();
    voices.close();
  });

  test("storage errors become typed SpeechErrors", () => {
    expect(toSpeechError(new DOMException("full", "QuotaExceededError")).code).toBe("quota-exceeded");
    expect(toSpeechError(new Error("weird")).code).toBe("internal");
    expect(toSpeechError("weird").message).toContain("weird");
    const typed = toSpeechError(new DOMException("x", "QuotaExceededError"));
    expect(toSpeechError(typed)).toBe(typed);
  });

  test("a database that can't be opened is reported in the snapshot", async () => {
    const name = freshName();
    const newer = await openDB(name, 5); // a future version: opening it at v2 fails with VersionError
    newer.close();
    const voices = createVoiceStore({ name, demoVoices: false });
    expect(await code(voices.ready)).toBe("internal");
    expect(voices.snapshot.error?.code).toBe("internal");
    voices.close();
  });
});

describe("clip utilities", () => {
  test("bestWindow finds the loud part", () => {
    const pcm = recording(16000, 3);
    const w = bestWindow(pcm, 16000, 3);
    expect(w.start).toBeCloseTo(1, 0);
    expect(w.end - w.start).toBeCloseTo(3, 5);
    expect(bestWindow(new Float32Array(16000), 16000, 5)).toEqual({ start: 0, end: 1 }); // shorter than the window
  });

  test("snapToZero moves cuts onto zero crossings (or leaves them when none is near)", () => {
    const pcm = Float32Array.from({ length: 1000 }, (_, i) => Math.sin((2 * Math.PI * i) / 100));
    const t = snapToZero(pcm, 1000, 0.047); // 3 ms before the crossing at 0.050
    expect(Math.abs(pcm[Math.round(t * 1000)] ?? 1)).toBeLessThan(0.07);
    expect(snapToZero(new Float32Array(1000).fill(0.5), 1000, 0.5)).toBe(0.5);
  });

  test("normalizePeak raises quiet audio, leaves loud or silent audio alone", () => {
    expect(Math.max(...normalizePeak(Float32Array.from([0.2, -0.1])))).toBeCloseTo(0.89, 5);
    const loud = Float32Array.from([0.95]);
    expect(normalizePeak(loud)).toBe(loud);
    const silent = new Float32Array(3);
    expect(normalizePeak(silent)).toBe(silent);
    expect(Math.max(...normalizePeak(Float32Array.from([0.01])))).toBeCloseTo(0.08, 5); // at most 8× gain
  });

  test("computePeaks gives min/max per bucket, even for very long buckets", () => {
    const peaks = Array.from(computePeaks(Float32Array.from([0.5, -0.25, 0.1, 0.2]), 2));
    for (const [i, v] of [-0.25, 0.5, 0, 0.2].entries()) expect(peaks[i]).toBeCloseTo(v, 6);
    expect(computePeaks(new Float32Array(2_000_000), 1).length).toBe(2); // no call-stack overflow
  });

  test("prepareClip honours explicit crops and the maximum length", async () => {
    const wav = encodeWav(recording(24000, 20), 24000); // 22 s
    const cropped = await prepareClip(wav, { crop: { start: 2, end: 4 } });
    expect(cropped.seconds).toBeCloseTo(2, 1);
    const capped = await prepareClip(wav, { crop: false, maxSeconds: 5 });
    expect(capped.seconds).toBeCloseTo(5, 1);
    const auto = await prepareClip(wav, { signal: new AbortController().signal });
    expect(auto.seconds).toBeCloseTo(10, 1); // the ideal maximum
  });
});
