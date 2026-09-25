// Text preparation for Chatterbox: sentence chunking tuned for streaming, and the reference punctuation cleanup.

export const MAX_CHUNK_CHARS = 200;
/** The first chunk is kept to about one clause so the first audio arrives quickly. */
export const FIRST_CHUNK_CHARS = 80;
/** Each chunk may be at most this much longer than the previous one, so it finishes generating before that one finishes playing. */
export const CHUNK_GROWTH = 1.6;
const MIN_CHUNK_CHARS = 40;

const ABBREV = /\b(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|e\.g|i\.e|approx|inc|ltd|co|no|fig|mt|u\.s|a\.m|p\.m)\.$/i;

/**
 * Split text into speakable chunks. Chunk sizes follow a growth plan: the first is ≤ FIRST_CHUNK_CHARS and every
 * later one ≤ CHUNK_GROWTH × the previous one (floored at FIRST_CHUNK_CHARS, capped at MAX_CHUNK_CHARS), so a tiny
 * chunk is never followed by one that takes longer to generate than the tiny one takes to play.
 */
export function splitText(input: string): string[] {
  const out: string[] = [];
  let cur = "";
  let limit = FIRST_CHUNK_CHARS;
  const commit = (chunk: string) => {
    out.push(chunk);
    limit = Math.min(MAX_CHUNK_CHARS, Math.max(FIRST_CHUNK_CHARS, Math.floor(chunk.length * CHUNK_GROWTH)));
  };
  for (const sentence of sentences(input)) {
    let rest = sentence;
    while (rest) {
      // Merge fragments too short to sound natural on their own, as long as the merged chunk stays within budget.
      const fits = cur.length + 1 + rest.length <= limit;
      if (cur && fits && (cur.length < MIN_CHUNK_CHARS || rest.length < MIN_CHUNK_CHARS)) {
        cur = `${cur} ${rest}`;
        rest = "";
        continue;
      }
      if (cur) commit(cur);
      cur = "";
      if (rest.length <= limit) {
        cur = rest;
        rest = "";
      } else {
        const cut = clauseCut(rest, limit);
        commit(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Sentences split at terminal punctuation followed by whitespace, so decimals/URLs, abbreviations and initials survive. */
function sentences(input: string): string[] {
  const text = input.replace(/\s+/g, " ").trim();
  const out: string[] = [];
  let start = 0;
  for (const m of text.matchAll(/[.!?…]+["'”’)\]]*(?=\s|$)/g)) {
    const end = m.index + m[0].length;
    const cand = text.slice(start, end).trim();
    if (ABBREV.test(cand) || /(?:^|\s)[A-Z]\.$/.test(cand)) continue;
    if (cand) out.push(cand);
    start = end;
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

/** Best cut ≤ limit: clause punctuation, then a conjunction, then any space; never leaves a head shorter than MIN_CHUNK_CHARS. */
function clauseCut(s: string, limit: number): number {
  const window = s.slice(0, limit);
  for (const re of [/[,;:—–)](?=\s)/g, /\s(?:and|but|or|so|because|which|while|then)\s/gi, /\s/g]) {
    let best = -1;
    for (const m of window.matchAll(re)) if (m.index >= MIN_CHUNK_CHARS) best = m.index + (m[0].trim() ? 1 : 0);
    if (best > 0) return best;
  }
  return limit;
}

const PUNCT_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  ["…", ", "],
  [":", ","],
  ["—", "-"],
  ["–", "-"],
  [" ,", ","],
  ["“", '"'],
  ["”", '"'],
  ["‘", "'"],
  ["’", "'"],
];

/**
 * Port of Chatterbox's `punc_norm`: capitalise, collapse whitespace, map punctuation rarely seen in training, and end
 * with punctuation. A chunk without terminal punctuation gives the model no cue to stop, which invites runaway generation.
 */
export function normalizeText(input: string): string {
  let text = input.replace(/\s+/g, " ").trim();
  if (!text) return text;
  text = text.charAt(0).toUpperCase() + text.slice(1);
  for (const [from, to] of PUNCT_REPLACEMENTS) text = text.replaceAll(from, to);
  text = text.replace(/\s+/g, " ").trimEnd(); // replacements like "…" → ", " can double a space
  return /[.!?,-]$/.test(text) ? text : `${text}.`;
}
