import { SpeechError, type SpeechErrorCode } from "@kucukkanat/speech-core";

type MicCode = Extract<SpeechErrorCode, `mic-${string}`>;

/** Maps a getUserMedia / AudioContext failure to a typed error with a message you can show users as-is. */
export function toMicError(e: unknown): SpeechError<MicCode> {
  const name = e instanceof Error ? e.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return new SpeechError(
        "mic-permission-denied",
        "Microphone access was blocked. Allow it in the browser's site settings and try again.",
        {
          cause: e,
        },
      );
    case "NotFoundError":
    case "OverconstrainedError":
      return new SpeechError("mic-not-found", "No microphone was found on this device.", { cause: e });
    case "NotReadableError":
    case "AbortError":
      return new SpeechError("mic-busy", "The microphone is busy in another app or tab.", { cause: e });
    default:
      return new SpeechError("mic-unknown", `Could not start the microphone: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
}

/** Throws the typed error for environments where capture can never work. */
export function assertMicSupported(env: { isSecureContext?: boolean; hasGetUserMedia: boolean; hasAudioWorklet: boolean }): void {
  if (env.isSecureContext === false) {
    throw new SpeechError("mic-insecure-context", "The microphone needs a secure context (HTTPS or localhost).");
  }
  if (!env.hasGetUserMedia || !env.hasAudioWorklet) {
    throw new SpeechError("mic-unsupported", "This browser cannot capture microphone audio (getUserMedia/AudioWorklet missing).");
  }
}
