/**
 * Every failure the speech SDKs report, as one discriminated union. A single list (rather than one per package) gives
 * autocomplete in `isSpeechError(e, "…")` no matter which package threw.
 */
export type SpeechErrorCode =
  // plumbing
  | "worker-crashed"
  | "disposed"
  | "internal"
  | "unsupported-environment"
  | "insecure-context"
  // models
  | "model-download-failed"
  | "model-init-failed"
  | "model-not-loaded"
  | "webgpu-required"
  | "unknown-model"
  // text-to-speech
  | "empty-text"
  | "invalid-voice"
  | "unsupported-option"
  | "generation-failed"
  | "autoplay-blocked"
  // speech-to-text
  | "busy"
  | "decode-failed"
  // microphone
  | "mic-permission-denied"
  | "mic-not-found"
  | "mic-busy"
  | "mic-unsupported"
  | "mic-insecure-context"
  | "mic-unknown"
  // voice store
  | "voice-not-found"
  | "built-in-read-only"
  | "db-blocked"
  | "quota-exceeded";

/** An error from the speech SDKs. `code` is stable API; `message` is a human-readable sentence you can show users. */
export class SpeechError<C extends SpeechErrorCode = SpeechErrorCode> extends Error {
  override readonly name = "SpeechError";
  readonly code: C;

  constructor(code: C, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
  }
}

/** Narrows `e` to a SpeechError, optionally with a specific code: `if (isSpeechError(e, "mic-permission-denied")) …` */
export function isSpeechError<C extends SpeechErrorCode>(e: unknown, code?: C): e is SpeechError<C> {
  return e instanceof SpeechError && (code === undefined || e.code === code);
}

/** True for the standard cancellation error (`DOMException` named "AbortError"), e.g. after `signal.abort()`. */
export function isAbortError(e: unknown): boolean {
  return e instanceof Error && e.name === "AbortError";
}

/** Throws the signal's reason (the web-standard behaviour) if it is already aborted. */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  signal?.throwIfAborted();
}

/** Wire format for errors crossing the worker boundary (Error instances lose their class when structured-cloned). */
export interface SerializedError {
  name: string;
  message: string;
  code?: SpeechErrorCode;
}

export function serializeError(e: unknown): SerializedError {
  if (e instanceof SpeechError) return { name: e.name, message: e.message, code: e.code };
  if (e instanceof Error) return { name: e.name, message: e.message };
  return { name: "Error", message: String(e) };
}

/** Rebuilds a worker-side error: SpeechErrors keep their code, aborts stay aborts, anything else is an "internal" bug. */
export function deserializeError(s: SerializedError): Error {
  if (s.code) return new SpeechError(s.code, s.message);
  if (s.name === "AbortError") return new DOMException(s.message, "AbortError");
  return new SpeechError("internal", s.message);
}
