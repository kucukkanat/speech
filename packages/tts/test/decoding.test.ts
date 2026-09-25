import { describe, expect, test } from "bun:test";
import { filterMinP, filterTopP, isDegenerate, maxNewTokens, penalizeRepeats } from "../src/internal/decoding.js";

describe("maxNewTokens", () => {
  test("leaves room for slow delivery of short phrases", () => {
    // "He smiled." measured 23 tokens
    expect(maxNewTokens(10)).toBeGreaterThan(23 * 2);
  });

  test("bounds the chunk that ran away to 489 tokens", () => {
    // 143 chars: normal ≈ 190 tokens; the old cap was 489
    expect(maxNewTokens(143)).toBeGreaterThan(210);
    expect(maxNewTokens(143)).toBeLessThan(400);
  });
});

describe("isDegenerate", () => {
  const speech = (n: number) => Array.from({ length: n }, (_, i) => BigInt((i * 7919) % 6561));

  test("is false for varied speech", () => {
    expect(isDegenerate(speech(200))).toBe(false);
  });

  test("is false before a full guard window has been generated", () => {
    expect(isDegenerate(Array(40).fill(4299n))).toBe(false);
  });

  test("detects a single token drone", () => {
    expect(isDegenerate([...speech(100), ...Array(80).fill(4299n)])).toBe(true);
  });

  test("detects a short cycle", () => {
    const loop = Array.from({ length: 90 }, (_, i) => [11n, 22n, 33n, 44n][i % 4] ?? 0n);
    expect(isDegenerate([...speech(50), ...loop])).toBe(true);
  });

  test("accepts plain numbers too", () => {
    expect(isDegenerate(Array(80).fill(1))).toBe(true);
  });
});

describe("penalizeRepeats", () => {
  test("pushes both positive and negative logits of seen tokens down", () => {
    const logits = Float32Array.from([2, -2, 5]);
    penalizeRepeats(logits, [0n, 1n, 0n], 2);
    expect(Array.from(logits)).toEqual([1, -4, 5]);
  });
});

describe("filterTopP", () => {
  test("keeps the smallest set reaching the mass", () => {
    const logits = Float32Array.from([Math.log(0.5), Math.log(0.3), Math.log(0.15), Math.log(0.05)]);
    filterTopP(logits, 0.75);
    expect(Array.from(logits).map(Number.isFinite)).toEqual([true, true, false, false]);
  });

  test("is a no-op at 1", () => {
    const logits = Float32Array.from([1, 2, 3]);
    filterTopP(logits, 1);
    expect(Array.from(logits)).toEqual([1, 2, 3]);
  });
});

describe("filterMinP", () => {
  test("drops tokens below minP × the top probability", () => {
    const logits = Float32Array.from([Math.log(0.6), Math.log(0.1), Math.log(0.02)]);
    filterMinP(logits, 0.05); // threshold 0.03
    expect(Array.from(logits).map(Number.isFinite)).toEqual([true, true, false]);
  });

  test("is a no-op at 0", () => {
    const logits = Float32Array.from([1, -50]);
    filterMinP(logits, 0);
    expect(Array.from(logits)).toEqual([1, -50]);
  });
});
