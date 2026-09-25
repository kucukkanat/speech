# @kucukkanat/docs

The documentation site and playground for the speech SDKs, built with [Blume](https://useblume.dev) and published to
GitHub Pages at **https://kucukkanat.github.io/speech/** by `.github/workflows/docs.yml` on every push to `main`.

```sh
bun run docs:dev          # from the repo root: dev server with hot reload
bun run docs:build        # static site in apps/docs/dist (served under /speech/)
bun run test:e2e:docs     # Playwright: every page renders, the playground speaks and transcribes with real models
```

| Path | |
|---|---|
| `docs/` | Pages (MDX). Code blocks are typechecked by `bun run docs:check`; mark config fragments ` ```ts no-check `. |
| `islands/` | Live demos usable in any page with no import: `<Playground />`, `<TrySpeak text="…" />`, `<TryTranscribe />`, `<TryVoices />`. |
| `lib/` | The demo panels and the engines they share (`lib/speech.ts`: one TTS, STT and voice store per page). |
| `blume.config.ts` | Site config; an Astro integration adds `speechSdk()` and resolves the SDKs to their workspace sources. |

The demos always run the SDK code in the same commit (the `@kucukkanat/source` condition), not a published release.
