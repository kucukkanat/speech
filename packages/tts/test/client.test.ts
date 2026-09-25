import { describe, expect, test } from "bun:test";
import { isSpeechError } from "@kucukkanat/speech-core";
import { createMemoryCache, createTTS, EXAGGERATION, isTtsModelKey, TTS_MODELS, type TtsModelKey, voiceId } from "../src/index.js";
import { CONDITIONING_VERSION, conditioningKey, voiceAudio } from "../src/voice.js";

// These tests exercise everything that doesn't need a downloaded model: option typing, validation and typed errors
// (none of these calls reach the worker), voice identity and the conditioning cache. Generation itself is covered by
// `bun run test:models` and the Playwright E2E suite.

const code = (p: Promise<unknown>) =>
  p.then(
    () => "resolved",
    (e: unknown) => (isSpeechError(e) ? e.code : String(e)),
  );

describe("createTTS", () => {
  test("defaults to Turbo, idle, with every model listed", () => {
    const tts = createTTS();
    expect(tts.model.key).toBe("chatterbox-turbo");
    expect(tts.status).toEqual({ state: "idle" });
    expect(tts.models.map((m) => m.key)).toEqual(["chatterbox-turbo", "chatterbox"]);
    tts.dispose();
  });

  test("rejects unknown models up front", () => {
    expect(() => createTTS({ model: "nope" as TtsModelKey })).toThrow('Unknown TTS model "nope"');
  });

  test("validates text and model-specific options before touching the model", async () => {
    const turbo = createTTS();
    expect(await code(turbo.synthesize("   "))).toBe("empty-text");
    // Runtime check for callers whose model is only known at runtime (the type check is below).
    const anyModel = turbo as unknown as ReturnType<typeof createTTS<TtsModelKey>>;
    expect(await code(anyModel.synthesize("Hi.", { exaggeration: 1 }))).toBe("unsupported-option");
    expect(turbo.status.state).toBe("idle"); // nothing was loaded
    turbo.dispose();

    const original = createTTS({ model: "chatterbox" });
    expect(await code(original.synthesize("Hi.", { exaggeration: EXAGGERATION.max + 1 }))).toBe("unsupported-option");
    original.dispose();
  });

  test("switchModel changes the selected model and its capabilities", async () => {
    const tts = createTTS<TtsModelKey>();
    expect(tts.model.supports.exaggeration).toBe(false);
    const original = await tts.switchModel("chatterbox"); // idle: selects without loading
    expect(original as unknown).toBe(tts); // same instance, re-typed
    expect(original.model.supports).toEqual({ tags: false, exaggeration: true });
    await expect(tts.switchModel("bogus" as TtsModelKey)).rejects.toThrow("Unknown TTS model");
    tts.dispose();
  });

  test("a disposed engine rejects with `disposed`", async () => {
    const tts = createTTS();
    tts.dispose();
    expect(await code(tts.synthesize("Hello."))).toBe("disposed");
    expect(await code(tts.load())).toBe("disposed");
  });

  test("an aborted signal rejects with its reason", async () => {
    const tts = createTTS();
    await expect(tts.load({ signal: AbortSignal.abort(new Error("changed my mind")) })).rejects.toThrow("changed my mind");
    tts.dispose();
  });
});

describe("types", () => {
  test("model-specific options are checked at compile time", () => {
    const turbo = createTTS();
    const original = createTTS({ model: "chatterbox" });
    const either = createTTS<TtsModelKey>();
    const noop = () => undefined;
    // @ts-expect-error — Turbo has no emotion control
    turbo.synthesize("Hi.", { exaggeration: 1 }).catch(noop);
    original.synthesize("Hi.", { exaggeration: 0.7 }).catch(noop);
    either.synthesize("Hi.", { exaggeration: 0.7 }).catch(noop); // runtime-checked
    for (const e of [turbo, original, either]) e.dispose();
  });
});

describe("models", () => {
  test("isTtsModelKey narrows unknown values", () => {
    expect(isTtsModelKey("chatterbox")).toBe(true);
    expect(isTtsModelKey("toString")).toBe(false); // not fooled by prototype keys
    expect(isTtsModelKey(42)).toBe(false);
  });

  test("every model's key matches its entry", () => {
    for (const [key, info] of Object.entries(TTS_MODELS)) expect(info.key).toBe(key as TtsModelKey);
  });
});

describe("voiceId", () => {
  const pcm = { pcm: Float32Array.from([0.1, 0.2, 0.3]), sampleRate: 24000 };

  test("identifies URLs by address and sources by their id", async () => {
    expect(await voiceId("/voices/me.wav")).toBe("url:/voices/me.wav");
    expect(await voiceId(new URL("https://x.test/a.wav"))).toBe("url:https://x.test/a.wav");
    expect(await voiceId({ id: "builtin-aria", audio: "/aria.wav" })).toBe("builtin-aria");
  });

  test("hashes PCM and Blob content, so the same recording gets the same id", async () => {
    const a = await voiceId(pcm);
    expect(a).toMatch(/^pcm:24000:[0-9a-f]{32}$/);
    expect(await voiceId({ pcm: pcm.pcm.slice(), sampleRate: 24000 })).toBe(a);
    expect(await voiceId({ pcm: Float32Array.from([0.1, 0.2, 0.4]), sampleRate: 24000 })).not.toBe(a);
    const blob = new Blob([new Uint8Array([1, 2, 3])]);
    const b = await voiceId(blob);
    expect(b).toMatch(/^blob:[0-9a-f]{32}$/);
    expect(await voiceId(new Blob([new Uint8Array([1, 2, 3])]))).toBe(b);
    expect(await voiceId(blob)).toBe(b); // memoised per object
  });
});

describe("voiceAudio / conditioningKey", () => {
  test("decode voice sources and PCM without copying PCM", async () => {
    const pcm = { pcm: Float32Array.from([0.5]), sampleRate: 16000 };
    expect(await voiceAudio(pcm)).toBe(pcm);
    expect(await voiceAudio({ id: "x", audio: pcm }, new AbortController().signal)).toBe(pcm);
  });

  test("keys include the model and the encoding version", () => {
    expect(conditioningKey("builtin-aria", "ResembleAI/chatterbox-turbo-ONNX")).toBe(
      `builtin-aria|ResembleAI/chatterbox-turbo-ONNX|v${CONDITIONING_VERSION}`,
    );
  });
});

describe("createMemoryCache", () => {
  const cond = (modelId: string) => ({ modelId, tensors: {} });

  test("stores, returns and evicts the least recently used entry", async () => {
    const cache = createMemoryCache(2);
    await cache.set("a", cond("a"));
    await cache.set("b", cond("b"));
    expect(await cache.get("a")).toEqual(cond("a")); // a is now most recent
    await cache.set("c", cond("c")); // evicts b
    expect(await cache.get("b")).toBeUndefined();
    expect(await cache.get("a")).toEqual(cond("a"));
    expect(await cache.get("c")).toEqual(cond("c"));
    await cache.set("c", cond("c2")); // overwrite doesn't evict
    expect(await cache.get("a")).toEqual(cond("a"));
  });
});
