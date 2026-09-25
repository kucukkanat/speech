export { isSpeechError, type LoadOptions, SpeechError, type SpeechErrorCode } from "@kucukkanat/speech-core";
export {
  createSTT,
  type ListenOptions,
  type SessionEvents,
  type SpeechToText,
  type STTOptions,
  type TranscribeOptions,
  type Transcript,
  type TranscriptionSession,
  type TranscriptUpdate,
} from "./client.js";
export type { AudioStream, TranscribeInput } from "./input.js";
export { isSttModelKey, STT_MODELS, type SttModelInfo, type SttModelKey } from "./models.js";
