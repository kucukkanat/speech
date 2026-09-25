import { useAudioLevel as useSdkAudioLevel } from "@kucukkanat/speech-react";
import { type MotionValue, useMotionValue } from "motion/react";
import { useRef } from "react";

/**
 * A MotionValue (0..1) following an AnalyserNode's level, smoothed with a fast attack and slow release so visuals
 * breathe instead of flicker. Built on the SDK's re-render-free useAudioLevel.
 */
export function useMotionLevel(analyser: AnalyserNode | null | undefined, active = true): MotionValue<number> {
  const level = useMotionValue(0);
  const smooth = useRef(0);
  useSdkAudioLevel(
    active ? (analyser ?? null) : null,
    (target) => {
      smooth.current += (target - smooth.current) * (target > smooth.current ? 0.5 : 0.12);
      level.set(target === 0 ? 0 : smooth.current);
    },
    { gain: 4.5 },
  );
  return level;
}
