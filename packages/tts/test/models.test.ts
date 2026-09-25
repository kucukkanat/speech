// Opt-in: `bun run test:models`. Runs the real worker with the real Chatterbox Turbo model on CPU (downloads ~0.7 GB
// on first run into the Hugging Face cache), exercising load → encode → streamed generation end to end.
import { expect, test } from "bun:test";
import { encodeWav, rms } from "@kucukkanat/speech-audio";
import { createTTS } from "../src/index.js";

const run = process.env.RUN_MODEL_TESTS === "1";
// Bun can't map the published "./tts.worker.js" URL to the TypeScript source, so point at it directly.
const worker = () => new Worker(new URL("../src/tts.worker.ts", import.meta.url), { type: "module" });

test.skipIf(!run)("Chatterbox Turbo speaks a cloned voice", async () => {
  const tts = createTTS({ device: "wasm", worker });
  const progress: number[] = [];
  await tts.load({ onProgress: (p) => progress.push(p.progress) });
  expect(tts.status).toMatchObject({ state: "ready", model: "chatterbox-turbo" });
  expect(progress.length).toBeGreaterThan(0);

  const voice = new URL("../../voices/assets/female.wav", import.meta.url);
  // Two sentences long enough not to be merged into one chunk by the chunk planner.
  const text = "The lighthouse keeper climbed the stairs one last time. Below him, the calm sea shimmered under the moon.";
  const chunks: number[] = [];
  let sentences = 0;
  for await (const chunk of tts.stream(text, { voice: Bun.file(voice) })) {
    chunks.push(chunk.pcm.length);
    if (chunk.final) sentences++;
  }
  expect(sentences).toBe(2);
  const clip = await tts.synthesize(text, { voice: Bun.file(voice) });
  // ~105 characters of speech: roughly 4–10 s, and clearly not silence or a runaway.
  expect(clip.duration).toBeGreaterThan(3.5);
  expect(clip.duration).toBeLessThan(12);
  expect(rms(clip.pcm)).toBeGreaterThan(0.01);
  expect(clip.sentences.map((s) => s.index)).toEqual([0, 1]);
  expect(encodeWav(clip.pcm, clip.sampleRate).size).toBe(44 + clip.pcm.length * 2);

  // Sampling overrides reach the worker: near-greedy, heavily penalised decoding still ends in plausible speech.
  const steady = await tts.synthesize("A calm and steady voice.", {
    voice: Bun.file(voice),
    sampling: { temperature: 0.3, topK: 50, topP: 0.9, minP: 0.05, repetitionPenalty: 1.5 },
  });
  expect(steady.duration).toBeGreaterThan(0.8);
  expect(steady.duration).toBeLessThan(6);
  expect(rms(steady.pcm)).toBeGreaterThan(0.01);
  tts.dispose();
});
