import { SpeechError } from "@kucukkanat/speech-core";

// Streaming vocoder planning: decode the growing speech-token stream in overlapping windows and stitch the audio.
//
//   tokens:  … emitted │ context ◄──┤ emit ├──► lookahead │ not yet generated
//   window:            from       emitFrom  emitTo       to
//
// Each window is decoded with `context` already-emitted tokens on the left (so its start is well conditioned) and
// `lookahead` tokens on the right that are *not* emitted yet (the vocoder's edge is unreliable). The next window
// re-decodes that lookahead region and its first `fadeSamples` are crossfaded with the previous window's preview of
// the same samples, hiding the seam. The final window runs to the end of the stream.

export interface StitchConfig {
  /** Tokens emitted by the first window (small = fast first audio). */
  first: number;
  /** Tokens emitted by every later window. */
  size: number;
  context: number;
  lookahead: number;
  samplesPerToken: number;
  fadeSamples: number;
}

export interface StitchState {
  /** Tokens whose audio has been emitted. */
  emitted: number;
  /** Previous window's preview of the samples right after `emitted`, crossfaded into the next window. */
  tail: Float32Array | null;
  windows: number;
}

export interface VocoderWindow {
  from: number;
  emitFrom: number;
  emitTo: number;
  to: number;
  final: boolean;
}

export const initialStitchState: StitchState = { emitted: 0, tail: null, windows: 0 };

/** The next window to decode given `available` generated tokens, or null if it's not worth decoding yet. */
export function nextWindow(cfg: StitchConfig, s: StitchState, available: number, final: boolean): VocoderWindow | null {
  const pending = available - s.emitted;
  const target = s.windows === 0 ? cfg.first : cfg.size;
  if (pending <= 0 || (!final && pending < target + cfg.lookahead)) return null;
  const to = final ? available : s.emitted + target + cfg.lookahead;
  return { from: Math.max(0, s.emitted - cfg.context), emitFrom: s.emitted, emitTo: final ? available : to - cfg.lookahead, to, final };
}

/**
 * Takes the decoded audio for tokens [from, to) (plus any trailing padding the final window adds) and returns the
 * samples to play now, crossfaded with the previous window, and the next state.
 */
export function stitch(
  cfg: StitchConfig,
  s: StitchState,
  w: VocoderWindow,
  audio: Float32Array,
): { state: StitchState; out: Float32Array } {
  const skip = (w.emitFrom - w.from) * cfg.samplesPerToken;
  const end = w.final ? audio.length : skip + (w.emitTo - w.emitFrom) * cfg.samplesPerToken;
  if (end > audio.length) throw new SpeechError("generation-failed", `Vocoder returned ${audio.length} samples, expected at least ${end}`);
  const out = audio.slice(skip, end);
  const fade = s.tail;
  if (fade) {
    const n = Math.min(fade.length, out.length);
    // Equal-power fade: the vocoder samples fresh noise on every call, so the two renders of this region share
    // content but not phase — i.e. they're weakly correlated, where a linear fade would dip in loudness.
    for (let i = 0; i < n; i++) {
      const t = ((i + 1) / (n + 1)) * (Math.PI / 2);
      out[i] = (fade[i] ?? 0) * Math.cos(t) + (out[i] ?? 0) * Math.sin(t);
    }
  }
  const tail = w.final ? null : audio.slice(end, Math.min(audio.length, end + cfg.fadeSamples));
  return { state: { emitted: w.emitTo, tail, windows: s.windows + 1 }, out };
}
