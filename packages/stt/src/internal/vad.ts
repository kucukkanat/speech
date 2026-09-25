export interface VadOptions {
  /** Absolute RMS floor for speech (post-AGC microphone audio). */
  minSpeechRms?: number;
  /** Speech if rms > noiseFloor × ratio. */
  ratio?: number;
}

/** Adaptive energy voice-activity detector over ~80 ms frames, with hysteresis. */
export class EnergyVad {
  private noise = 0.004;
  private active = false;
  private readonly minRms: number;
  private readonly ratio: number;

  constructor(opts: VadOptions = {}) {
    this.minRms = opts.minSpeechRms ?? 0.012;
    this.ratio = opts.ratio ?? 3;
  }

  /** True if the frame is (likely) speech. */
  process(frameRms: number): boolean {
    const on = Math.max(this.minRms, this.noise * this.ratio);
    const off = on * 0.6; // hysteresis
    const speech = this.active ? frameRms > off : frameRms > on;
    // Track the noise floor: fall quickly, rise slowly (only while not speaking).
    if (frameRms < this.noise) this.noise = this.noise * 0.7 + frameRms * 0.3;
    else if (!speech) this.noise = this.noise * 0.98 + frameRms * 0.02;
    this.noise = Math.min(Math.max(this.noise, 1e-4), 0.05);
    this.active = speech;
    return speech;
  }

  reset(): void {
    this.active = false;
  }
}
