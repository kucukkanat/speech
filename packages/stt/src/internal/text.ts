/** A transcript so far: `committed` never changes again; `partial` is a live guess that may still be revised. */
export interface StreamUpdate {
  committed: string;
  partial: string;
}

/** Joins two transcript fragments with exactly one space. */
export function joinText(a: string, b: string): string {
  const bt = b.trim();
  if (!bt) return a;
  if (!a) return bt;
  return /\s$/.test(a) ? a + bt : `${a} ${bt}`;
}
