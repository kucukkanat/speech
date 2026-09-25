---
"@kucukkanat/tts": minor
"@kucukkanat/speech-core": minor
---

- `@kucukkanat/tts`: per-call token `sampling` options (`temperature`, `topK`, `topP`, `minP`, `repetitionPenalty`) on
  `speak()`, `stream()` and `synthesize()`, validated against `SAMPLING_RANGES`; each model's defaults are exposed as
  `tts.model.sampling`.
- `@kucukkanat/speech-core`: `speechSdk()` plugin for esbuild and Bun (`@kucukkanat/speech-core/esbuild`, `/bun`),
  which bundles the engines' workers and emits the demo voices — including in Bun's HTML dev server.
