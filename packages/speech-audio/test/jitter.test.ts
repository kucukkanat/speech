import { describe, expect, test } from "bun:test";
import { type BufferState, MIN_START_SECONDS, requiredBuffer, shouldRelease } from "../src/jitter.js";

const base: BufferState = {
  scheduledAhead: 0,
  pending: 0,
  produced: 0,
  elapsed: 0,
  totalChars: 300,
  doneChars: 0,
  doneSeconds: 0,
  finished: false,
};

describe("shouldRelease", () => {
  test("holds until anything has been generated", () => {
    expect(shouldRelease(base)).toBe(false);
  });

  test("never interrupts audio that is already playing", () => {
    expect(shouldRelease({ ...base, scheduledAhead: 0.5, pending: 0.1, produced: 1, elapsed: 5 })).toBe(true);
  });

  test("releases everything once generation has finished", () => {
    expect(shouldRelease({ ...base, pending: 0.1, produced: 0.1, elapsed: 5, finished: true })).toBe(true);
  });

  test("starts almost immediately when generation outpaces playback", () => {
    const fast = { ...base, pending: 0.6, produced: 0.6, elapsed: 0.35 }; // rtf ≈ 0.58
    expect(requiredBuffer(fast)).toBe(MIN_START_SECONDS);
    expect(shouldRelease(fast)).toBe(true);
  });

  test("waits for a buffer that covers the predicted shortfall when generation is slower than real time", () => {
    // rtf 1.4, ~19.5 s of speech expected for 300 chars → ~18.9 s left → need ≈ 18.9 × 0.4 × 1.2 ≈ 9 s
    const slow = { ...base, pending: 0.6, produced: 0.6, elapsed: 0.84 };
    expect(requiredBuffer(slow)).toBeGreaterThan(8);
    expect(requiredBuffer(slow)).toBeLessThan(10);
    expect(shouldRelease(slow)).toBe(false);
    expect(shouldRelease({ ...slow, pending: 10, produced: 10, elapsed: 14 })).toBe(true);
  });

  test("uses the measured speaking rate once a sentence has finished", () => {
    const s = { ...base, pending: 1, produced: 3, elapsed: 4.2, doneChars: 30, doneSeconds: 3 }; // 0.1 s/char
    // 300 chars × 0.1 = 30 s total, 27 left, rtf 1.4 → 27 × 0.4 × 1.2 = 12.96
    expect(requiredBuffer(s)).toBeCloseTo(12.96, 5);
  });
});
