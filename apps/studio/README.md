# Voice Lab

The demo app for the `@kucukkanat` speech SDKs: clone a voice from a few seconds of audio, speak text with it
(sentences light up as you hear them), and transcribe the microphone live — all on-device.

```sh
bun install          # from the repository root
bun run dev          # https://localhost:5443 (self-signed; HTTP=1 bun run dev for plain http://localhost:5443)
bun run test:e2e     # Playwright: real models, fake microphone (first run downloads ~0.9 GB of models)
```

How it's built:

- `src/speech.ts` creates the app's engines once: `createTTS`, `createSTT` and a `createVoiceStore` whose
  `conditioningCache` makes saved voices speak instantly after a reload.
- Views use the hooks from `@kucukkanat/speech-react` (`useSpeak`, `useTranscription`, `useVoices`, `useEngine`);
  everything else is UI.
- Styling goes through the design tokens in `src/styles/tokens.css` (surfaces, accents and semantic `good` / `warn` /
  `danger` / `highlight` colours).
- `?device=wasm` forces the CPU backend (used by the E2E suite).
