import { CLIP_SECONDS } from "@kucukkanat/voices";

export { bestWindow, computePeaks, snapToZero } from "@kucukkanat/voices";

// The cropper's selection rules come straight from the SDK's reference-clip guidance.
export const MIN_SEL = CLIP_SECONDS.min;
export const MAX_SEL = CLIP_SECONDS.max;
export const IDEAL_MIN = CLIP_SECONDS.idealMin;
export const IDEAL_MAX = CLIP_SECONDS.idealMax;

export function selectionTone(len: number): "ideal" | "ok" | "bad" {
  if (len < MIN_SEL - 1e-6 || len > MAX_SEL + 1e-6) return "bad";
  return len >= IDEAL_MIN && len <= IDEAL_MAX ? "ideal" : "ok";
}
