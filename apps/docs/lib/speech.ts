// The engines behind every demo on a page. Islands hydrate separately but share this module, so a model loaded by one
// demo (or the playground) is ready for the others — and only one copy of each model sits in GPU memory.
import type { Device } from "@kucukkanat/speech-core";
import { createSTT, type SttModelKey } from "@kucukkanat/stt";
import { createTTS, type TtsModelKey } from "@kucukkanat/tts";
import { createVoiceStore } from "@kucukkanat/voices";
import { parseDevice } from "./format";

/** `?stt-device=wasm|webgpu` picks the speech-to-text backend (the device is fixed when an engine is created). */
export const sttDevice: Device | "auto" = parseDevice(new URLSearchParams(globalThis.location?.search).get("stt-device"));

export const voices = createVoiceStore({ name: "speech-docs" });
// Text-to-speech needs WebGPU in browsers, so it always picks it automatically.
export const tts = createTTS<TtsModelKey>({ cache: voices.conditioningCache });
export const stt = createSTT<SttModelKey>({ device: sttDevice });
