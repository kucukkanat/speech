export { isSpeechError, type LoadOptions, SpeechError, type SpeechErrorCode } from "@kucukkanat/speech-core";
export {
  type AudioChunk,
  createTTS,
  type GenerateOptions,
  type SpeakOptions,
  type TextToSpeech,
  type TTSOptions,
} from "./client.js";
export {
  EXAGGERATION,
  isTtsModelKey,
  type ModelOptionsFor,
  TTS_MODELS,
  type TtsModelInfo,
  type TtsModelKey,
  type TtsModelOptions,
} from "./models.js";
export type {
  AudioClip,
  ClipSentence,
  PlayOptions,
  SentenceInfo,
  Speech,
  SpeechEvents,
  SpeechResult,
  SpeechState,
  SpeechStats,
} from "./speech.browser.js";
export { CONDITIONING_VERSION, createMemoryCache, type VoiceInput, type VoiceSource, voiceId } from "./voice.js";
