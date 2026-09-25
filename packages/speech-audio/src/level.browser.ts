/**
 * Calls `onLevel` once per animation frame with the RMS level (0..1, scaled by `gain`) of what `analyser` hears.
 * Framework-agnostic: feed a React ref, a motion value or a canvas. Returns a stop function.
 */
export function createLevelMeter(analyser: AnalyserNode, onLevel: (level: number) => void, options: { gain?: number } = {}): () => void {
  const gain = options.gain ?? 1;
  const buf = new Float32Array(analyser.fftSize);
  let raf = 0;
  const tick = () => {
    analyser.getFloatTimeDomainData(buf);
    let s = 0;
    for (const x of buf) s += x * x;
    onLevel(Math.min(1, Math.sqrt(s / buf.length) * gain));
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
