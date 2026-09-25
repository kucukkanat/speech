import { describe, expect, test } from "bun:test";
import { createSTT, isSpeechError, isSttModelKey, STT_MODELS, type SttModelKey } from "../src/index.js";

// Everything that doesn't need a downloaded model. Real transcription is covered by `bun run test:models` and E2E.

describe("createSTT", () => {
  test("defaults to Moonshine, idle, with every model listed", () => {
    const stt = createSTT();
    expect(stt.model.key).toBe("moonshine-base");
    expect(stt.status).toEqual({ state: "idle" });
    expect(stt.models.map((m) => m.key)).toEqual(["moonshine-base", "voxtral-realtime"]);
    stt.dispose();
  });

  test("rejects unknown models", async () => {
    expect(() => createSTT({ model: "nope" as SttModelKey })).toThrow('Unknown STT model "nope"');
    const stt = createSTT<SttModelKey>();
    await expect(stt.switchModel("bogus" as SttModelKey)).rejects.toThrow("Unknown STT model");
    const voxtral = await stt.switchModel("voxtral-realtime");
    expect(voxtral.model.requiresWebGPU).toBe(true);
    stt.dispose();
  });

  test("a disposed engine's sessions reject with `disposed`", async () => {
    const stt = createSTT();
    stt.dispose();
    const err = await stt.transcribe(new Blob([])).catch((e: unknown) => e);
    expect(isSpeechError(err, "disposed")).toBe(true);
  });

  test("`ready` rejects when the session fails before audio flows", async () => {
    const stt = createSTT();
    stt.dispose();
    const err = await stt.transcribe(new Blob([])).ready.catch((e: unknown) => e);
    expect(isSpeechError(err, "disposed")).toBe(true);
  });

  test("an aborted signal rejects the session with its reason", async () => {
    const stt = createSTT();
    await expect(stt.transcribe("x.wav", { signal: AbortSignal.abort(new Error("cancelled")) }).done).rejects.toThrow("cancelled");
    stt.dispose();
  });
});

test("isSttModelKey narrows unknown values", () => {
  expect(isSttModelKey("voxtral-realtime")).toBe(true);
  expect(isSttModelKey("constructor")).toBe(false);
  for (const [key, info] of Object.entries(STT_MODELS)) expect(info.key).toBe(key as SttModelKey);
});
