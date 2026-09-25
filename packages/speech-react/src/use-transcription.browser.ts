import type { ListenOptions, SpeechToText, SttModelKey, Transcript, TranscriptionSession } from "@kucukkanat/stt";
import { useCallback, useEffect, useRef, useState } from "react";

export interface TranscriptionHookOptions {
  /** Microphone level (0..1) for meters, called per audio frame without re-rendering. */
  onLevel?: (level: number) => void;
}

export interface TranscriptionHookState {
  /** Starts listening to the microphone (loading the model first if needed). */
  start: (options?: ListenOptions) => void;
  /** Stops listening; resolves with the session's final transcript. */
  stop: () => Promise<Transcript | null>;
  /** Forgets the text so far (also mid-session: only words after this point are kept). */
  clear: () => void;
  /** Model loading or microphone opening */
  starting: boolean;
  listening: boolean;
  /** Everything transcribed across sessions since the last clear() */
  text: string;
  committed: string;
  /** The live, still-changing tail */
  partial: string;
  error: unknown;
}

const join = (...parts: string[]) =>
  parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" ");

/**
 * Live microphone transcription that accumulates across start/stop.
 *
 * ```tsx
 * const { start, stop, listening, text, partial } = useTranscription(stt);
 * ```
 */
export function useTranscription<M extends SttModelKey>(
  stt: SpeechToText<M>,
  options: TranscriptionHookOptions = {},
): TranscriptionHookState {
  const session = useRef<TranscriptionSession | null>(null);
  const onLevel = useRef(options.onLevel);
  onLevel.current = options.onLevel;
  const [archive, setArchive] = useState("");
  const [committed, setCommitted] = useState("");
  const [partial, setPartial] = useState("");
  const [clearedAt, setClearedAt] = useState(0);
  const [starting, setStarting] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const clearedAtRef = useRef(0);
  clearedAtRef.current = clearedAt;

  const start = useCallback(
    (listenOptions?: ListenOptions) => {
      if (session.current) return;
      const s = stt.listen(listenOptions);
      session.current = s;
      setError(null);
      setStarting(true);
      setClearedAt(0);
      s.ready.then(
        () => {
          setStarting(false);
          setListening(true);
        },
        () => setStarting(false), // the failure itself is reported through `done` below
      );
      s.on("update", (u) => {
        setCommitted(u.committed);
        setPartial(u.partial);
      });
      s.on("level", (level) => onLevel.current?.(level));
      s.done
        .then(
          (t) => setArchive((a) => join(a, t.text.slice(clearedAtRef.current))),
          (e: unknown) => setError(e),
        )
        .finally(() => {
          session.current = null;
          setListening(false);
          setStarting(false);
          setCommitted("");
          setPartial("");
          setClearedAt(0);
          onLevel.current?.(0);
        });
    },
    [stt],
  );

  const stop = useCallback(async () => {
    const s = session.current;
    return s ? s.stop() : null;
  }, []);

  const clear = useCallback(() => {
    setArchive("");
    setClearedAt(session.current?.current.committed.length ?? 0);
    setPartial("");
  }, []);

  useEffect(() => () => void session.current?.stop(), []);

  const liveCommitted = committed.slice(clearedAt);
  return {
    start,
    stop,
    clear,
    starting,
    listening,
    text: join(archive, liveCommitted, partial),
    committed: join(archive, liveCommitted),
    partial,
    error,
  };
}
