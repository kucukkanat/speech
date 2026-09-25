import { useTranscription } from "@kucukkanat/speech-react";
import { useMotionValue } from "motion/react";
import { useEffect, useState } from "react";
import { stt } from "../../speech";

/** The SDK's useTranscription plus what this UI adds: a MotionValue level for the mic rings and an elapsed timer. */
export function useLiveTranscript() {
  const level = useMotionValue(0);
  // sqrt expands quiet speech so the rings react to normal talking, not only shouting.
  const tr = useTranscription(stt, { onLevel: (rms) => level.set(Math.min(1, Math.sqrt(rms) * 1.8)) });
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [dismissed, setDismissed] = useState<unknown>(null);

  useEffect(() => {
    if (!tr.listening) return setStartedAt(null);
    setStartedAt(performance.now());
    setElapsed(0);
  }, [tr.listening]);
  useEffect(() => {
    if (startedAt === null) return;
    const t = window.setInterval(() => setElapsed(performance.now() - startedAt), 250);
    return () => window.clearInterval(t);
  }, [startedAt]);

  const error = tr.error && tr.error !== dismissed ? (tr.error instanceof Error ? tr.error.message : String(tr.error)) : undefined;
  return { ...tr, level, elapsed, error, dismissError: () => setDismissed(tr.error) };
}
