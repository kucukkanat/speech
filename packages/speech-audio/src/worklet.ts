// Pure core of the microphone AudioWorklet (see ./worklet.browser.ts). CONSTRAINT: `createDownsampler` is stringified
// and run inside AudioWorkletGlobalScope, so it must stay self-contained — no imports, no outer references.

export interface DownsamplerOptions {
  inRate: number;
  outRate: number;
  /** Output samples per emitted frame */
  frameSize: number;
}

/**
 * Mono mixdown + exact area (box-filter) downsampling, which doubles as an anti-alias low-pass. Push render quanta
 * (one Float32Array per channel); get back complete frames of `frameSize` output samples.
 */
export function createDownsampler(options: DownsamplerOptions): (channels: readonly Float32Array[]) => Float32Array[] {
  const ratio = options.inRate / options.outRate;
  let acc = 0;
  let need = ratio;
  let frame = new Float32Array(options.frameSize);
  let filled = 0;
  return (channels) => {
    const frames: Float32Array[] = [];
    const first = channels[0];
    if (!first) return frames;
    for (let i = 0; i < first.length; i++) {
      let x = 0;
      for (const ch of channels) x += ch[i] ?? 0;
      x /= channels.length;
      // Spread this input sample (weight 1) over output bins of width `ratio`.
      let w = 1;
      while (w > 1e-9) {
        const take = Math.min(w, need);
        acc += x * take;
        need -= take;
        w -= take;
        if (need <= 1e-9) {
          frame[filled++] = acc / ratio;
          acc = 0;
          need = ratio;
          if (filled === options.frameSize) {
            frames.push(frame);
            frame = new Float32Array(options.frameSize);
            filled = 0;
          }
        }
      }
    }
    return frames;
  };
}
