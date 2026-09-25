// Playback start/restart policy for streamed TTS: a small jitter buffer sized from the live generation speed.
//
// If generation runs at `rtf` seconds of compute per second of audio and R seconds of audio are still to come,
// finishing takes R·rtf while playing it takes R. Playback never stalls once started iff the buffer B covers the
// difference: B ≥ R·(rtf − 1). With rtf < 1 only a small cushion is needed.

/** Minimum audio to hold before (re)starting, so a single late window doesn't cause a stutter. */
export const MIN_START_SECONDS = 0.3;
/** Margin on the predicted shortfall; generation speed wobbles (thermal throttling, GPU contention). */
const SAFETY = 1.2;
/** Speech length per character until a finished sentence gives us a measurement for this voice. */
const DEFAULT_SECONDS_PER_CHAR = 0.065;

export interface BufferState {
  /** Audio already handed to the player and not yet played, in seconds. */
  scheduledAhead: number;
  /** Generated audio held back, not yet handed to the player. */
  pending: number;
  /** All audio generated so far (includes `pending`). */
  produced: number;
  /** Wall-clock seconds since generation started. */
  elapsed: number;
  totalChars: number;
  /** Characters / audio seconds of the sentences that finished generating. */
  doneChars: number;
  doneSeconds: number;
  finished: boolean;
}

/** Whether held-back audio should be handed to the player now. */
export function shouldRelease(s: BufferState): boolean {
  // Never interrupt audio that is already playing; only decide when (re)starting from silence.
  if (s.finished || s.scheduledAhead > 0) return true;
  if (s.produced <= 0) return false;
  return s.pending >= requiredBuffer(s);
}

/** Seconds of audio to hold before starting so playback can run to the end without stalling. */
export function requiredBuffer(s: BufferState): number {
  const rtf = s.elapsed / s.produced;
  const secondsPerChar = s.doneChars > 0 ? s.doneSeconds / s.doneChars : DEFAULT_SECONDS_PER_CHAR;
  const remaining = Math.max(0, s.totalChars * secondsPerChar - s.produced);
  return Math.max(MIN_START_SECONDS, remaining * (rtf - 1) * SAFETY);
}
