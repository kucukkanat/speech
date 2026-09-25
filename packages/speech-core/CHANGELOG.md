# @kucukkanat/speech-core

## 0.1.0

### Minor Changes

- 9a480fc: First release: on-device, voice-cloning text-to-speech (Chatterbox Turbo / Chatterbox) and streaming speech-to-text
  (Moonshine / Voxtral Realtime) for the browser, with a voice library, React hooks, typed errors and a Vite plugin.
- 9200941: - `@kucukkanat/tts`: per-call token `sampling` options (`temperature`, `topK`, `topP`, `minP`, `repetitionPenalty`) on
    `speak()`, `stream()` and `synthesize()`, validated against `SAMPLING_RANGES`; each model's defaults are exposed as
    `tts.model.sampling`.
  - `@kucukkanat/speech-core`: `speechSdk()` plugin for esbuild and Bun (`@kucukkanat/speech-core/esbuild`, `/bun`),
    which bundles the engines' workers and emits the demo voices — including in Bun's HTML dev server.
