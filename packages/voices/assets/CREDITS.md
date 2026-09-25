# Demo voice credits

Both demo reference clips come from **LibriTTS-R** (Koizumi et al., 2023), a restored
24 kHz version of LibriTTS, which is derived from LibriSpeech / LibriVox public-domain
audiobook recordings.

- Dataset: https://huggingface.co/datasets/mythicinfinity/libritts_r (mirror of https://www.openslr.org/141/)
- License: **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0/)
- Attribution: "LibriTTS-R: A Restored Multi-Speaker Text-to-Speech Corpus", Y. Koizumi et al., Interspeech 2023.
  Underlying recordings: LibriVox volunteers (public domain).

| File | Utterance id (test.clean) | Speaker | Median f0 | Text |
|---|---|---|---|---|
| `male.wav` | `1089_134691_000002_000001` | LibriSpeech speaker 1089 | ~101 Hz | "A full hour had passed since his father had gone in with Dan Crosby, the tutor, to find out for him something about the university." |
| `female.wav` | `1580_141083_000006_000002` | LibriSpeech speaker 1580 | ~200 Hz | "He shrugged his shoulders in ungracious acquiescence, while our visitor in hurried words and with much excitable gesticulation poured forth his story." |

Modifications: DC removed, leading/trailing silence trimmed, 10 ms fades, peak-normalised to
-1 dBFS, stored as 24 kHz mono 16-bit PCM WAV.

Gender labels were verified with an autocorrelation f0 estimate (Praat via parselmouth).
`default_voice.wav` from `onnx-community/chatterbox-ONNX` (MIT) was evaluated but not used:
its f0 is strongly bimodal (median 133 Hz, 10–90th percentile 94–220 Hz), so it could not be
labelled reliably.
