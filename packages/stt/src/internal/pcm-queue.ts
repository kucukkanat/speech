export const SAMPLE_RATE = 16000;
/** 80 ms @ 16 kHz — one Voxtral text token worth of audio; also the microphone frame size. */
export const FRAME_SAMPLES = 1280;

/**
 * Growable 16 kHz PCM buffer addressed by absolute sample index, so consumed audio can be trimmed without
 * invalidating indices. `waitFor(n)` resolves when `length >= n` or the queue is closed.
 */
export interface PcmQueue {
  /** Absolute end index (total samples ever pushed). */
  readonly length: number;
  readonly closed: boolean;
  push(pcm: Float32Array): void;
  close(): void;
  /** Copy of absolute range [start, end); samples not (yet) available are zero. */
  slice(start: number, end: number): Float32Array;
  /** Drops samples before absolute index `abs` (amortised: only once ≥ 4 s can go). */
  trimBefore(abs: number): void;
  waitFor(n: number): Promise<void>;
}

export function createPcmQueue(): PcmQueue {
  let buf = new Float32Array(SAMPLE_RATE * 8);
  let base = 0; // absolute index of buf[0]
  let used = 0;
  let closed = false;
  let waiters: Array<() => void> = [];
  const length = () => base + used;
  const wake = () => {
    const w = waiters;
    waiters = [];
    for (const f of w) f();
  };
  return {
    get length() {
      return length();
    },
    get closed() {
      return closed;
    },
    push(pcm) {
      if (closed) return;
      if (used + pcm.length > buf.length) {
        const next = new Float32Array(Math.max(buf.length * 2, used + pcm.length));
        next.set(buf.subarray(0, used));
        buf = next;
      }
      buf.set(pcm, used);
      used += pcm.length;
      wake();
    },
    close() {
      closed = true;
      wake();
    },
    slice(start, end) {
      const out = new Float32Array(Math.max(0, end - start));
      const s = Math.max(start, base);
      const e = Math.min(end, length());
      if (e > s) out.set(buf.subarray(s - base, e - base), s - start);
      return out;
    },
    trimBefore(abs) {
      const n = Math.min(Math.max(0, abs - base), used);
      if (n < SAMPLE_RATE * 4) return;
      buf.copyWithin(0, n, used);
      used -= n;
      base += n;
    },
    waitFor(n) {
      if (length() >= n || closed) return Promise.resolve();
      return new Promise((resolve) => {
        const check = () => {
          if (length() >= n || closed) resolve();
          else waiters.push(check);
        };
        waiters.push(check);
      });
    },
  };
}
