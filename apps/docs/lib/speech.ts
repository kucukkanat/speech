// The engines behind every demo on a page. Islands hydrate separately but share this module, so a model loaded by one
// demo (or the playground) is ready for the others — and only one copy of each model sits in GPU memory.
import { createSTT, type SttModelKey } from "@kucukkanat/stt";
import { createTTS, type TtsModelKey } from "@kucukkanat/tts";
import { createVoiceStore } from "@kucukkanat/voices";

export const voices = createVoiceStore({ name: "speech-docs" });
export const tts = createTTS<TtsModelKey>({ cache: voices.conditioningCache });
export const stt = createSTT<SttModelKey>();
