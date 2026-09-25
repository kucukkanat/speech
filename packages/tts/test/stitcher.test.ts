import { describe, expect, test } from "bun:test";
import { initialStitchState, nextWindow, type StitchConfig, type StitchState, stitch } from "../src/internal/stitcher.js";

const cfg: StitchConfig = { first: 3, size: 5, context: 2, lookahead: 1, samplesPerToken: 4, fadeSamples: 2 };

/** A fake vocoder: every sample of token t has value t (+ `bias`, to tell two renders of the same token apart). */
const render = (from: number, to: number, bias = 0, padTokens = 0) =>
  Float32Array.from({ length: (to - from + padTokens) * cfg.samplesPerToken }, (_, i) => from + Math.floor(i / cfg.samplesPerToken) + bias);

/** Streams `total` tokens one at a time, decoding windows as they become available, like the worker does. */
function stream(total: number, bias = (_w: number) => 0) {
  let s: StitchState = initialStitchState;
  const out: number[] = [];
  const windows = [];
  for (let avail = 1; avail <= total; avail++) {
    const final = avail === total;
    for (let w = nextWindow(cfg, s, avail, final); w; w = nextWindow(cfg, s, avail, final)) {
      windows.push(w);
      const r = stitch(cfg, s, w, render(w.from, w.to, bias(windows.length), w.final ? 1 : 0));
      s = r.state;
      out.push(...r.out);
    }
  }
  return { out, windows, state: s };
}

describe("nextWindow", () => {
  test("waits until the first window plus lookahead is available", () => {
    expect(nextWindow(cfg, initialStitchState, 3, false)).toBeNull();
    expect(nextWindow(cfg, initialStitchState, 4, false)).toEqual({ from: 0, emitFrom: 0, emitTo: 3, to: 4, final: false });
  });

  test("later windows carry left context", () => {
    const s: StitchState = { emitted: 3, tail: null, windows: 1 };
    expect(nextWindow(cfg, s, 9, false)).toEqual({ from: 1, emitFrom: 3, emitTo: 8, to: 9, final: false });
  });

  test("the final window flushes whatever is left", () => {
    expect(nextWindow(cfg, initialStitchState, 2, true)).toEqual({ from: 0, emitFrom: 0, emitTo: 2, to: 2, final: true });
    expect(nextWindow(cfg, { emitted: 2, tail: null, windows: 1 }, 2, true)).toBeNull();
  });
});

describe("stitch", () => {
  test("emits every token exactly once, in order, plus the final padding", () => {
    const { out, windows, state } = stream(17);
    expect(out.length).toBe(18 * cfg.samplesPerToken); // 17 tokens + 1 padding token
    expect(state.emitted).toBe(17);
    const seams = new Set(
      windows.slice(1).flatMap((w) => Array.from({ length: cfg.fadeSamples }, (_, i) => w.emitFrom * cfg.samplesPerToken + i)),
    );
    out.forEach((v, i) => {
      if (!seams.has(i)) expect(v).toBe(Math.floor(i / cfg.samplesPerToken));
    });
  });

  test("equal-power crossfades the previous render's preview into the next render", () => {
    // Window k renders with bias k*10, so each seam sample is identifiable as a blend of two renders.
    const { out, windows } = stream(9, (k) => k * 10);
    const second = windows[1];
    if (!second) throw new Error("expected at least two windows");
    const seam = second.emitFrom * cfg.samplesPerToken;
    const token = second.emitFrom;
    const [prev, next] = [token + 10, token + 20];
    for (let i = 0; i < cfg.fadeSamples; i++) {
      const t = ((i + 1) / (cfg.fadeSamples + 1)) * (Math.PI / 2);
      expect(out[seam + i]).toBeCloseTo(prev * Math.cos(t) + next * Math.sin(t), 4);
    }
    expect(out[seam - 1]).toBe(token - 1 + 10);
    expect(out[seam + cfg.fadeSamples]).toBe(next);
  });

  test("rejects a vocoder output that is too short", () => {
    const w = nextWindow(cfg, initialStitchState, 4, false);
    if (!w) throw new Error("expected a window");
    expect(() => stitch(cfg, initialStitchState, w, new Float32Array(3))).toThrow(/expected at least/);
  });
});

describe("whole-sentence mode", () => {
  const whole: StitchConfig = { ...cfg, first: Number.POSITIVE_INFINITY, size: Number.POSITIVE_INFINITY };

  test("never opens a window before the stream ends, then decodes it in one pass", () => {
    expect(nextWindow(whole, initialStitchState, 500, false)).toBeNull();
    expect(nextWindow(whole, initialStitchState, 500, true)).toEqual({ from: 0, emitFrom: 0, emitTo: 500, to: 500, final: true });
  });
});
