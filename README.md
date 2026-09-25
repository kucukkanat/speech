# @kucukkanat speech SDKs

On-device **text-to-speech with voice cloning** and **streaming speech-to-text** for the browser. Models run on WebGPU
(or WASM) in Web Workers: no server, no API keys, nothing leaves the device.

**[Documentation & playground →](https://kucukkanat.github.io/speech/)**

```ts
import { createSTT } from "@kucukkanat/stt";
import { createTTS } from "@kucukkanat/tts";

const tts = createTTS();
await tts.speak("Hello! I'm running entirely in your browser."); // from a click handler

const stt = createSTT();
const session = stt.listen();
session.on("update", ({ text }) => console.log(text));
```

| Package | What it does |
|---|---|
| [`@kucukkanat/tts`](packages/tts) | Voice-cloning TTS (Chatterbox Turbo / Chatterbox): streaming playback, karaoke timing, clips |
| [`@kucukkanat/stt`](packages/stt) | Streaming STT (Moonshine / Voxtral Realtime): microphone, files, any audio stream |
| [`@kucukkanat/voices`](packages/voices) | A persistent voice library (IndexedDB) with demo voices and clip preparation |
| [`@kucukkanat/speech-react`](packages/speech-react) | React hooks: `useSpeak`, `useTranscription`, `useVoices`, `useEngine`, … |
| [`@kucukkanat/speech-audio`](packages/speech-audio) | Microphone frames, gapless player, recorder, WAV/decoding/resampling |
| [`@kucukkanat/speech-core`](packages/speech-core) | Vite plugin, typed errors, capability detection, worker RPC |

[`apps/studio`](apps/studio) is **Voice Lab**, a full app built on these packages: clone a voice from a recording,
speak text with karaoke highlighting, and transcribe live.

## Development

Requires [Bun](https://bun.sh) 1.3+.

```sh
bun install
bun run dev            # Voice Lab on https://localhost:5443 (HTTP=1 for plain http://localhost)
bun run docs:dev       # the docs site (Blume) with the playground
```

Packages resolve to each other's **TypeScript sources** during development (the `@kucukkanat/source` export condition),
so edits to `packages/*` hot-reload in the app with no build step.

| Command | |
|---|---|
| `bun run test` | Unit + integration tests for every package (100% coverage threshold, no mocks) |
| `bun run test:models` | Opt-in: real models on CPU (downloads ~0.8 GB once) |
| `bun run test:e2e` | Playwright against Voice Lab with real models and a fake microphone |
| `bun run test:e2e:docs` | Playwright against the built docs site and its playground, served under `/speech/` |
| `bun run test:consumers` | Packs the packages and checks them in a fresh Vite app (dev + production build) |
| `bun run typecheck` · `bun run lint` · `bun run format` | TypeScript (strict), Biome |
| `bun run build` | Builds every package to `dist/`, then Voice Lab and the docs site |
| `bun run check:packages` | publint + are-the-types-wrong on every package |
| `bun run docs:check` | Typechecks every README and docs-site example |

## Releasing

Versions are managed with [Changesets](https://github.com/changesets/changesets); all packages share one version.

1. `bun run changeset` — describe the change (commit the generated file with your PR).
2. On `main`, the Release workflow opens a "Version packages" PR; merging it publishes to npm with provenance
   (npm trusted publishing — configure the repository as a trusted publisher on npmjs.com for each package).

`bun run release --dry-run` shows locally what would be published.

## Repository layout

```
packages/     the SDKs (each with its own README and runnable examples)
apps/studio   Voice Lab, the demo app (Vite + React + Tailwind)
apps/docs     the documentation site and playground (Blume), deployed to GitHub Pages on every push to main
fixtures/     consumer-vite: a fresh app that installs the packed tarballs
scripts/      build, typecheck, doc-test, consumer test and release tooling
```

## License

MIT
