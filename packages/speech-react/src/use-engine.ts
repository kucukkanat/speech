import type { EngineStatus, LoadOptions, LoadProgress, SpeechError } from "@kucukkanat/speech-core";
import { useCallback, useSyncExternalStore } from "react";

/** Anything with a model lifecycle: a TextToSpeech or SpeechToText instance. */
export interface EngineLike<M extends string> {
  readonly status: EngineStatus<M>;
  readonly subscribe: (listener: (status: EngineStatus<M>) => void) => () => void;
  load(options?: LoadOptions): Promise<void>;
}

export interface EngineState<M extends string> {
  status: EngineStatus<M>;
  ready: boolean;
  loading: boolean;
  /** Download / initialisation progress while loading */
  progress: LoadProgress | null;
  error: SpeechError | null;
  /** Starts loading the model; the returned promise rejects with the typed error (which also lands in `error`). */
  load: (options?: LoadOptions) => Promise<void>;
}

/**
 * Tracks a TTS or STT engine's model lifecycle.
 *
 * ```tsx
 * const { ready, progress, load } = useEngine(tts);
 * ```
 */
export function useEngine<M extends string>(engine: EngineLike<M>): EngineState<M> {
  const status = useSyncExternalStore(
    engine.subscribe,
    () => engine.status,
    () => engine.status,
  );
  const load = useCallback((options?: LoadOptions) => engine.load(options), [engine]);
  return {
    status,
    ready: status.state === "ready",
    loading: status.state === "loading",
    progress: status.state === "loading" ? status.progress : null,
    error: status.state === "error" ? status.error : null,
    load,
  };
}
