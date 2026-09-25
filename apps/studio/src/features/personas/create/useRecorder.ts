import { type Recording, startRecording } from "@kucukkanat/speech-audio";
import { CLIP_SECONDS } from "@kucukkanat/voices";
import { useMotionValue } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

export const MAX_RECORD_SECONDS = CLIP_SECONDS.max;

export type RecorderState = "idle" | "requesting" | "recording" | "error";

/** A microphone recording with a live level (MotionValue) and a hard length limit, for the "record a voice" step. */
export function useRecorder(onDone: (blob: Blob) => void) {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string>();
  const [elapsed, setElapsed] = useState(0);
  const level = useMotionValue(0);
  const recording = useRef<Recording | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  const stop = useCallback(() => recording.current?.stop(), []);

  const start = useCallback(async () => {
    setError(undefined);
    setState("requesting");
    try {
      const rec = await startRecording({ maxSeconds: MAX_RECORD_SECONDS });
      recording.current = rec;
      setState("recording");
      rec.on("level", (l) => level.set(Math.min(1, l * 5)));
      rec.on("time", setElapsed);
      const blob = await rec.done;
      setState("idle");
      done.current(blob);
    } catch (e) {
      // SDK errors carry a user-facing message (e.g. "Microphone access was blocked…").
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    } finally {
      recording.current = null;
      level.set(0);
    }
  }, [level]);

  useEffect(() => () => recording.current?.stop(), []);

  return { state, error, elapsed, level, start, stop };
}
