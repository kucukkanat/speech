import { createLevelMeter } from "@kucukkanat/speech-audio";
import { useEffect, useRef } from "react";

/**
 * Calls `onLevel` every animation frame with the level (0..1) of `analyser` — without re-rendering. Feed it into a
 * ref, a motion value or a canvas. Pass `null` to pause.
 *
 * ```tsx
 * useAudioLevel(speech.analyser, (level) => (bar.current!.style.transform = `scaleY(${level})`), { gain: 4 });
 * ```
 */
export function useAudioLevel(analyser: AnalyserNode | null, onLevel: (level: number) => void, options: { gain?: number } = {}): void {
  // Latest callback without restarting the meter every render.
  const callback = useRef(onLevel);
  callback.current = onLevel;
  const gain = options.gain ?? 1;
  useEffect(() => {
    if (!analyser) return;
    const stop = createLevelMeter(analyser, (level) => callback.current(level), { gain });
    return () => {
      stop();
      callback.current(0);
    };
  }, [analyser, gain]);
}
