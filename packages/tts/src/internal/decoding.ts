// Pure pieces of speech-token decoding, kept free of transformers.js so they are unit-testable.

/** Speech tokens run at 25 Hz. */
export const TOKENS_PER_SECOND = 25;

/**
 * Upper bound on generated speech tokens for a chunk. Measured speech is ~1.3 tokens/char (short, slow phrases up
 * to ~2.3), so 50 + 2.2/char leaves room for slow delivery while bounding a runaway to a few extra seconds.
 */
export function maxNewTokens(chars: number): number {
  return 50 + Math.ceil(chars * 2.2);
}

/** A healthy 3 s stretch of speech uses dozens of distinct tokens; a stuck loop or a long drone uses only a handful. */
const GUARD_WINDOW = 3 * TOKENS_PER_SECOND;
const GUARD_MIN_UNIQUE = 12;

/** True when the tail of the generated tokens has collapsed into a loop, i.e. generation should stop. */
export function isDegenerate(generated: readonly (bigint | number)[]): boolean {
  return generated.length >= GUARD_WINDOW && new Set(generated.slice(-GUARD_WINDOW)).size < GUARD_MIN_UNIQUE;
}

/** Repetition penalty over the given (already generated) tokens, in place. Matches HF's CTRL-style penalty. */
export function penalizeRepeats(logits: Float32Array, tokens: Iterable<bigint | number>, penalty: number): void {
  for (const t of new Set(tokens)) {
    const k = Number(t);
    const l = logits[k];
    if (l !== undefined) logits[k] = l < 0 ? l * penalty : l / penalty;
  }
}

/** Nucleus filter, in place: keep the smallest set of tokens whose probability mass reaches `topP`. */
export function filterTopP(logits: Float32Array, topP: number): void {
  if (topP >= 1) return;
  const probs = softmax(logits);
  const order = Array.from(probs.entries()).sort((a, b) => b[1] - a[1]);
  let mass = 0;
  for (const [i, p] of order) {
    if (mass >= topP) logits[i] = -Infinity;
    mass += p;
  }
}

/** Min-p filter, in place: drop tokens whose probability is below `minP` × the most likely token's probability. */
export function filterMinP(logits: Float32Array, minP: number): void {
  if (minP <= 0) return;
  // p_i / p_max = exp(l_i - l_max), so the threshold works directly on logits.
  let max = -Infinity;
  for (const l of logits) max = Math.max(max, l);
  const cutoff = max + Math.log(minP);
  logits.forEach((l, i) => {
    if (l < cutoff) logits[i] = -Infinity;
  });
}

function softmax(logits: Float32Array): Float64Array {
  let max = -Infinity;
  for (const l of logits) max = Math.max(max, l);
  const exp = Float64Array.from(logits, (l) => Math.exp(l - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  return exp.map((e) => e / sum);
}
