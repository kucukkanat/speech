// Opt-in: `bun run test:models`. Runs the real worker with the real Moonshine model on CPU (~70 MB download on first
// run), feeding a recording with a known transcript through the same streaming path the microphone uses.
import { expect, test } from "bun:test";
import { createSTT } from "../src/index.js";

const run = process.env.RUN_MODEL_TESTS === "1";
// Bun can't map the published "./stt.worker.js" URL to the TypeScript source, so point at it directly.
const worker = () => new Worker(new URL("../src/stt.worker.ts", import.meta.url), { type: "module" });
// LibriTTS-R 1089_134691_000002_000001 (see packages/voices/assets/CREDITS.md)
const clip = new URL("../../voices/assets/male.wav", import.meta.url);

test.skipIf(!run)("Moonshine transcribes a recording", async () => {
  const stt = createSTT({ device: "wasm", worker });
  const session = stt.transcribe(Bun.file(clip));
  const updates: string[] = [];
  session.on("update", ({ text }) => updates.push(text));
  const { text, complete } = await session;
  expect(complete).toBe(true);
  const words = text.toLowerCase();
  for (const w of ["full hour", "father", "tutor", "university"]) expect(words).toContain(w);
  expect(updates.length).toBeGreaterThan(0);
  expect(stt.status).toMatchObject({ state: "ready", model: "moonshine-base", device: "wasm" });

  // Streams work too: the same audio as live 80 ms frames (what a microphone delivers).
  const { decodeAudio, resample } = await import("@kucukkanat/speech-audio");
  const { pcm, sampleRate } = await decodeAudio(Bun.file(clip));
  const audio = resample(pcm, sampleRate, 16000);
  async function* frames() {
    for (let i = 0; i < audio.length; i += 1280) yield audio.slice(i, i + 1280);
  }
  const live = await stt.transcribe(frames());
  expect(live.text.toLowerCase()).toContain("university");
  stt.dispose();
});
