# @kucukkanat/tts

On-device, voice-cloning **text-to-speech for the browser**. Runs [Chatterbox](https://huggingface.co/ResembleAI/chatterbox-turbo-ONNX)
on WebGPU in a Web Worker: no server, no API key, nothing leaves the device.

**[Documentation](https://kucukkanat.github.io/speech/packages/tts) · [Playground](https://kucukkanat.github.io/speech/playground)**

- **One line to speak**: `await tts.speak("Hello!")` — the model downloads on first use and is cached.
- **Clone any voice** from a 5–15 s recording: a URL, a `File`, a microphone recording, raw PCM.
- **Streams while it generates**: audio starts after ~0.6 s of speech is ready, with a jitter buffer so it never stutters.
- **Follow along**: `sentence` events fire on the audio clock, for karaoke-style highlighting.
- **Typed everything**: per-model options are checked at compile time; every failure is a `SpeechError` with a `code`.

```sh
bun add @kucukkanat/tts   # or npm i / pnpm add
```

## Quick start

```ts
import { createTTS } from "@kucukkanat/tts";

const tts = createTTS();

// Call from a click handler the first time: browsers only allow audio after a user gesture.
document.querySelector("button")?.addEventListener("click", async () => {
  await tts.speak("Hello! This voice is generated entirely inside your browser.");
});
```

With no `voice`, the model's reference speaker is used. The first call downloads the model (~725 MB for Turbo) and
caches it in the browser; later page loads start in seconds, offline.

## Clone a voice

`voice` accepts anything that holds a recording of the speaker:

```ts
import { createTTS } from "@kucukkanat/tts";

const tts = createTTS();
const fileInput = document.querySelector<HTMLInputElement>("input[type=file]");

// A URL (same-origin or CORS-enabled)…
await tts.speak("Nice to meet you.", { voice: "/voices/me.wav" });

// …a File or Blob (wav, mp3, ogg, webm, m4a…)…
const file = fileInput?.files?.[0];
if (file) await tts.speak("This is my own voice.", { voice: file });

// …or raw mono PCM.
const pcm = new Float32Array(24_000 * 6); // 6 s of audio you captured yourself
await tts.speak("From raw samples.", { voice: { pcm, sampleRate: 24_000 } });
```

Learning a voice ("encoding") takes about a second the first time and is cached, so later calls with the same voice
start immediately. To keep voices across reloads, pass a persistent cache — or use
[`@kucukkanat/voices`](../voices), a ready-made voice library:

```ts
import { createTTS } from "@kucukkanat/tts";
import { createVoiceStore } from "@kucukkanat/voices";

const voices = createVoiceStore();
const tts = createTTS({ cache: voices.conditioningCache });

const [aria] = await voices.list(); // bundled demo voices, plus the ones you create
if (aria) await tts.speak("Hi, I'm Aria.", { voice: aria });
```

## Follow along while it speaks

`speak()` returns a `Speech`: await it, listen to it, or stop it.

```ts
import { createTTS } from "@kucukkanat/tts";

const tts = createTTS();
const speech = tts.speak("First sentence. Second sentence. Third one.");

speech.on("state", (state) => console.log(state)); // loading → encoding → generating → buffering → playing → ended
speech.on("sentence", ({ index, count, text }) => console.log(`${index + 1}/${count}: ${text}`)); // when it becomes audible
speech.on("stats", ({ ttfaMs, audioSeconds }) => console.log(ttfaMs, audioSeconds));

document.querySelector("#stop")?.addEventListener("click", () => speech.stop());

const { clip, stats, stopped } = await speech;
console.log(`${clip.duration.toFixed(1)} s, first audio after ${stats.ttfaMs?.toFixed(0)} ms`, stopped ? "(stopped)" : "");
```

- `speech.analyser` is a live `AnalyserNode` for waveforms and level meters.
- `stop()` resolves the speech with `stopped: true` (and the audio generated so far) — it is not an error.
- Pass `{ signal }` to cancel with an `AbortSignal`; the speech then rejects with the signal's reason.
- Returning a `Speech` from an `async` function awaits it (it's thenable). Return `{ speech }` if you need the handle.

## Save, replay, or post-process

```ts
import { createTTS } from "@kucukkanat/tts";

const tts = createTTS();

// The whole text as one clip (no playback).
const clip = await tts.synthesize("Saved for later.");
const url = URL.createObjectURL(clip.toWav()); // 16-bit mono WAV
document.querySelector<HTMLAudioElement>("audio")?.setAttribute("src", url);

// Replay with the same events as speak(): clip.play()
await clip.play();

// Or stream raw PCM blocks as they're generated, e.g. into your own audio graph.
for await (const chunk of tts.stream("Streaming sentence one. And two.")) {
  console.log(chunk.sentence.index, chunk.pcm.length, chunk.sampleRate, chunk.final);
  // `break` here cancels the rest of the generation.
}
```

## Models

Both run on **WebGPU** in browsers (their quantized graphs use an operator ONNX Runtime's WASM backend lacks; without
WebGPU, `load()` rejects with `webgpu-required`). Under Node or Bun they run on the CPU.

| Model | Size | Speed | Extras |
|---|---|---|---|
| `"chatterbox-turbo"` (default) | ~725 MB | ~2× faster than real time; streams within a sentence | `[laugh]`, `[sigh]`… tags |
| `"chatterbox"` | ~1.5 GB | slower than real time; buffers before playing | `exaggeration` (emotion) |

Options only some models accept are **typed per model**:

```ts
import { createTTS } from "@kucukkanat/tts";

const expressive = createTTS({ model: "chatterbox" });
await expressive.speak("This is so exciting!", { exaggeration: 1.2 }); // 0.25 flat … 2 dramatic, 0.5 neutral

const turbo = createTTS(); // Turbo: exaggeration would be a compile error here
await turbo.speak("That's hilarious [laugh] okay.");
```

When the model is picked at runtime (a settings screen), use the full union and check `tts.model.supports`:

```ts
import { createTTS, type TtsModelKey } from "@kucukkanat/tts";

const tts = createTTS<TtsModelKey>();
await tts.switchModel("chatterbox"); // releases the previous model's GPU memory
const intensity = 0.8;
await tts.speak("Hello.", tts.model.supports.exaggeration ? { exaggeration: intensity } : {});
```

## Tune the delivery

Speech is sampled token by token. Each model ships with the reference implementation's settings
(`tts.model.sampling`); override any of them per call:

```ts
import { createTTS, SAMPLING_RANGES } from "@kucukkanat/tts";

const tts = createTTS();
console.log(tts.model.sampling); // { temperature: 0.8, topK: 1000, topP: 0.95, minP: 0, repetitionPenalty: 1.2 }

// Steadier and more predictable, e.g. for narration:
await tts.speak("Chapter one. The storm had passed.", { sampling: { temperature: 0.5, repetitionPenalty: 1.4 } });

// Livelier, with more variation between takes:
await tts.speak("Wait, you did what?", { sampling: { temperature: 1.1, topP: 1 } });

console.log(SAMPLING_RANGES.temperature); // { min: 0.05, max: 2 }
```

| Option | Effect | Range |
|---|---|---|
| `temperature` | Randomness: lower is steadier and flatter, higher is livelier but may slur or ramble | 0.05–2 |
| `topK` | Only the k most likely tokens (0 = no limit) | 0–8192, whole |
| `topP` | Only the most likely tokens that together reach this probability (1 = off) | 0.05–1 |
| `minP` | Drop tokens less than `minP` × as likely as the best one (0 = off) | 0–1 |
| `repetitionPenalty` | Above 1, discourages repeated sounds: fewer stutters and loops (1 = off) | 1–3 |

Out-of-range values reject with `unsupported-option` before anything runs. `sampling` works with `speak()`,
`stream()` and `synthesize()`, on every model.

## Loading and status

Every method loads the model on first use. To show progress up front, load explicitly and subscribe to `status` (a
stable snapshot, so it plugs straight into React's `useSyncExternalStore` — or use
[`@kucukkanat/speech-react`](../speech-react)):

```ts
import { createTTS } from "@kucukkanat/tts";

const tts = createTTS();
tts.subscribe((status) => {
  if (status.state === "loading") console.log(`${Math.round(status.progress.progress * 100)}% ${status.progress.label}`);
  if (status.state === "ready") console.log(`ready on ${status.device}`);
  if (status.state === "error") console.error(status.error.code, status.error.message);
});
await tts.load();
await tts.prepare("/voices/me.wav"); // optional: learn a voice ahead of time
```

## Errors

Every failure is a `SpeechError` with a stable `code` and a message you can show to users:

```ts
import { createTTS, isSpeechError } from "@kucukkanat/tts";

const tts = createTTS();
try {
  await tts.speak("Hello.", { voice: "/missing.wav" });
} catch (e) {
  if (isSpeechError(e, "autoplay-blocked")) console.warn("Call speak() from a click or key press.");
  else if (isSpeechError(e, "decode-failed")) console.warn(e.message); // e.g. "/missing.wav returned an HTML page…"
  else throw e;
}
```

Codes you may see: `webgpu-required`, `empty-text`, `invalid-voice`, `decode-failed`, `unsupported-option`, `autoplay-blocked`,
`generation-failed`, `model-download-failed`, `model-init-failed`, `worker-crashed`, `disposed`.

## Bundlers

The model runs in a Web Worker shipped with this package and created with
`new Worker(new URL("./tts.worker.js", import.meta.url), { type: "module" })`. webpack 5, Next.js and Rspack bundle
it automatically; Vite, esbuild and Bun take one plugin from `@kucukkanat/speech-core`:

**Vite**: keeps the worker out of dependency pre-bundling (and can serve the dev server cross-origin isolated):

```ts no-check
// vite.config.ts
import { speechSdk } from "@kucukkanat/speech-core/vite";
import { defineConfig } from "vite";

export default defineConfig({ plugins: [speechSdk({ isolation: true })] });
```

**esbuild** and **Bun**: bundles the worker (with transformers.js) and the demo voices as files next to your bundle:

```ts
// build.ts
import { speechSdk } from "@kucukkanat/speech-core/esbuild";
import * as esbuild from "esbuild";

await esbuild.build({ entryPoints: ["src/main.ts"], bundle: true, format: "esm", outdir: "dist", plugins: [speechSdk()] });
```

```ts
// build.ts (run with `bun build.ts`)
import { speechSdk } from "@kucukkanat/speech-core/bun";

await Bun.build({ entrypoints: ["src/main.ts"], outdir: "dist", target: "browser", plugins: [speechSdk()] });
```

**Anything else**: bundle the worker entry (`@kucukkanat/tts/worker`) with your bundler's worker syntax and pass a
factory. With Vite's `?worker` import, for example:

```ts no-check
import TtsWorker from "@kucukkanat/tts/worker?worker";
const tts = createTTS({ worker: () => new TtsWorker() });
```

**Next.js**: use it from client components only (`"use client"`); it needs browser APIs.

## Hosting

- **WebGPU is required in browsers** (recent Chrome/Edge, Safari 26+). Check up front with `detectCapabilities()` from
  `@kucukkanat/speech-core`, or handle the `webgpu-required` error.
- **Cross-origin isolation is optional** but makes the WASM fallback multi-threaded. Serve pages with
  `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` (not `require-corp`,
  which would block model downloads from Hugging Face).
- **Self-hosting / strict CSP / offline**: models come from Hugging Face and ONNX Runtime's WASM files from jsDelivr
  by default. Point them elsewhere with `createTTS({ transformers: { remoteHost, wasmPaths } })`.

## License

MIT. Model weights: [Chatterbox Turbo](https://huggingface.co/ResembleAI/chatterbox-turbo-ONNX) (MIT) and
[Chatterbox](https://huggingface.co/onnx-community/chatterbox-ONNX) (MIT), by Resemble AI.
