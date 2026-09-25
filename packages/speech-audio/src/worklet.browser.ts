// The microphone AudioWorklet, shipped as function source and loaded from a Blob URL so it works in every bundler with
// zero configuration. CONSTRAINT: `micWorkletMain` is stringified and runs in AudioWorkletGlobalScope, so it must be
// self-contained — no imports, no references to anything outside its own body.

import { createDownsampler } from "./worklet.js";

/** Runs inside the worklet scope: registers a processor that posts `{ pcm }` frames (buffer transferred). */
export function micWorkletMain(makeDownsampler: typeof createDownsampler, name: string, frameSize: number, outRate: number): void {
  interface WorkletScope {
    sampleRate: number;
    registerProcessor(name: string, ctor: unknown): void;
    AudioWorkletProcessor: new () => { readonly port: MessagePort };
  }
  const scope = globalThis as unknown as WorkletScope;
  const downsample = makeDownsampler({ inRate: scope.sampleRate, outRate, frameSize });
  scope.registerProcessor(
    name,
    class extends scope.AudioWorkletProcessor {
      // `declare` + constructor assignment instead of a class field: some bundler targets compile fields into a helper
      // defined outside this function, which would be missing once the function is stringified.
      declare stopped: boolean;
      constructor() {
        super();
        this.stopped = false;
        this.port.onmessage = (e: MessageEvent) => {
          if (e.data === "stop") this.stopped = true;
        };
      }
      process(inputs: Float32Array[][]): boolean {
        if (this.stopped) return false;
        for (const pcm of downsample(inputs[0] ?? [])) this.port.postMessage({ pcm }, [pcm.buffer]);
        return true;
      }
    },
  );
}

/** Source code of the worklet module for the given output format. */
export function micWorkletSource(name: string, frameSize: number, outRate: number): string {
  return `(${micWorkletMain.toString()})(${createDownsampler.toString()}, ${JSON.stringify(name)}, ${frameSize}, ${outRate});`;
}
