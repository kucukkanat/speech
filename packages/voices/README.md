# @kucukkanat/voices

A persistent **voice library** for [`@kucukkanat/tts`](../tts): voices live in IndexedDB, come with two bundled demo
voices, and remember their encodings so a saved voice speaks instantly after a reload.

- **Any recording in, a clean reference clip out**: cropped to the best 5–10 s, zero-crossing cuts, peak-normalised.
- **Records plug straight into TTS**: `tts.speak(text, { voice: record })`.
- **Your metadata, typed**: colours, emoji, tags — `createVoiceStore<{ color: string }>()`.
- **Reactive**: a stable `snapshot` + `subscribe` (ready for `useSyncExternalStore`, or use `useVoices` from
  [`@kucukkanat/speech-react`](../speech-react)).

```sh
bun add @kucukkanat/voices @kucukkanat/tts
```

## Quick start

```ts
import { createTTS } from "@kucukkanat/tts";
import { createVoiceStore } from "@kucukkanat/voices";

const voices = createVoiceStore();
// Encodings are saved with the voices, so they're learned once, not on every page load.
const tts = createTTS({ cache: voices.conditioningCache });

const list = await voices.list(); // the demo voices "Aria" and "Orion", then yours (newest first)
const aria = list.find((v) => v.name === "Aria");
if (aria) await tts.speak("Hello, I'm one of the demo voices.", { voice: aria });
```

## Add a voice

`create()` takes any recording (URL, `File`/`Blob`, bytes or PCM) and turns it into a reference clip:

```ts
import { startRecording } from "@kucukkanat/speech-audio";
import { createVoiceStore } from "@kucukkanat/voices";

const voices = createVoiceStore();

// From a file picker…
const file = document.querySelector<HTMLInputElement>("input[type=file]")?.files?.[0];
if (file) await voices.create({ name: "Narrator", audio: file, meta: {} });

// …or from the microphone: read a sentence or two, naturally.
const recording = await startRecording({ maxSeconds: 12 });
setTimeout(() => recording.stop(), 8000);
const me = await voices.create({ name: "Me", audio: await recording.done, meta: {} });
console.log(`${me.name}: ${me.seconds.toFixed(1)} s clip`);
```

Cropping options: `crop: "auto"` (default, the most energetic stretch of up to 10 s), `crop: false` (keep everything up
to `maxSeconds`), or `crop: { start, end }` in seconds — for example from your own waveform selector.

## Your own metadata

```ts
import { createVoiceStore } from "@kucukkanat/voices";

interface Look {
  color: string;
  emoji?: string;
}

// With custom metadata, say what the demo voices should get — or `demoVoices: false` to skip them.
const voices = createVoiceStore<Look>({
  name: "my-app-voices",
  demoVoices: (demo) => ({ color: demo.name === "Aria" ? "#ff4f9a" : "#6c5cff" }),
});

const [first] = await voices.list();
if (first) {
  console.log(first.meta.color);
  await voices.update(first.id, { meta: { color: "#00c2a8", emoji: "🎙️" } });
}
```

## Remove, with undo

```ts
import { createVoiceStore } from "@kucukkanat/voices";

const voices = createVoiceStore();
const [, , mine] = await voices.list();
if (mine) {
  const removed = await voices.remove(mine.id); // also drops its cached encodings
  await voices.restore(removed); // "Undo": back with the same id
}
```

Demo voices can't be removed (`built-in-read-only`).

## React to changes

```ts
import { createVoiceStore } from "@kucukkanat/voices";

const voices = createVoiceStore();
const unsubscribe = voices.subscribe(({ voices: list, loading, error }) => {
  if (error) console.error(error.code, error.message); // e.g. db-blocked, quota-exceeded
  else if (!loading) console.log(list.map((v) => v.name));
});
await voices.ready;
unsubscribe();
```

## Clip utilities

The processing behind `create()` is exported for custom editors:

```ts
import { decodeAudio } from "@kucukkanat/speech-audio";
import { bestWindow, CLIP_SECONDS, computePeaks, prepareClip } from "@kucukkanat/voices";

const { pcm, sampleRate } = await decodeAudio("/interview.mp3");
const peaks = computePeaks(pcm, 400); // min/max pairs for drawing a waveform
const suggestion = bestWindow(pcm, sampleRate, CLIP_SECONDS.idealMax); // { start, end } in seconds
const clip = await prepareClip({ pcm, sampleRate }, { crop: suggestion });
console.log(peaks.length, clip.seconds, clip.wav.type); // 800, ≤10, "audio/wav"
```

## Storage notes

- One IndexedDB database per store (`name`, default `"kucukkanat-voices"`) with two object stores: `voices` and
  `conditioning` (encoded voices, keyed by voice, model and encoding version).
- Opening a database that another tab keeps open at an older version reports `db-blocked` in `snapshot.error` until
  that tab closes.
- Databases created by the original Voice Lab app (a `personas` store) are migrated in place: colours and emoji move
  into `meta`.
- The demo voices are bundled audio files referenced with `new URL(…, import.meta.url)`; every mainstream bundler
  serves them automatically. Pass `demos` to ship your own starter voices instead.

## License

MIT. Demo voices from [LibriTTS-R](https://www.openslr.org/141/) (CC BY 4.0) — see [assets/CREDITS.md](./assets/CREDITS.md).
