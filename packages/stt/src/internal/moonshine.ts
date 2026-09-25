import { rms } from "@kucukkanat/speech-audio";
import { SAMPLE_RATE } from "./pcm-queue.js";
import { joinText, type StreamUpdate } from "./text.js";
import { EnergyVad, type VadOptions } from "./vad.js";

export interface MoonshineStreamerOptions {
  /** Offline transcription of a 16 kHz mono clip. Never called concurrently (the streamer guarantees that). */
  transcribe: (audio: Float32Array) => Promise<string>;
  onUpdate: (update: StreamUpdate) => void;
  /** A transcription failed. The streamer keeps going; the caller decides whether that ends the session. */
  onError: (error: unknown) => void;
  /** Re-decode the growing utterance at most this often (ms of wall clock). `Infinity` disables live partials. */
  partialIntervalMs?: number;
  /** Silence that ends an utterance. */
  endSilenceMs?: number;
  /** Force-commit utterances longer than this. */
  maxUtteranceMs?: number;
  /** Utterances with less voiced audio than this are dropped (clicks, coughs). */
  minSpeechMs?: number;
  /** Audio kept before speech onset. */
  preRollMs?: number;
  vad?: VadOptions;
  now?: () => number;
}

const ms2s = (ms: number) => Math.round((ms * SAMPLE_RATE) / 1000);

/**
 * Yield a macrotask. ORT-wasm inference resolves through microtasks only, so a decode started directly from a
 * message handler would block all queued audio messages until it finishes — and the next decode would start after
 * ingesting just ONE frame (backlog grows without bound). Yielding first lets every queued frame land.
 */
const yieldTask = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Energy-VAD segmented, rolling re-decode (pseudo-streaming for an offline model):
 *  - while speech is active, the whole current utterance is re-transcribed every `partialIntervalMs` and emitted as
 *    `partial` (skipped while the model is busy, so there's no unbounded queue)
 *  - after `endSilenceMs` of silence (or `maxUtteranceMs`) the utterance is decoded once more and appended to
 *    `committed`.
 */
export class MoonshineStreamer {
  private readonly o: Required<Omit<MoonshineStreamerOptions, "vad">>;
  private readonly vad: EnergyVad;
  private committed = "";
  private partial = "";

  // current utterance
  private utt: Float32Array[] = [];
  private uttSamples = 0;
  private voicedSamples = 0;
  private silenceSamples = 0;
  private inSpeech = false;
  private preRoll: Float32Array[] = [];
  private preRollSamples = 0;
  /** Incremented per utterance so stale partial results are discarded. */
  private uttId = 0;

  private busy = false;
  private lastPartialAt = Number.NEGATIVE_INFINITY;
  private lastPartialSamples = 0;
  private finals: Promise<void> = Promise.resolve();
  private pendingFinals = 0;

  constructor(opts: MoonshineStreamerOptions) {
    this.o = {
      partialIntervalMs: 350,
      endSilenceMs: 600,
      maxUtteranceMs: 20000,
      minSpeechMs: 240,
      preRollMs: 240,
      now: () => performance.now(),
      ...opts,
    };
    this.vad = new EnergyVad(opts.vad);
  }

  get text(): StreamUpdate {
    return { committed: this.committed, partial: this.partial };
  }

  push(frame: Float32Array): void {
    const speech = this.vad.process(rms(frame));

    if (!this.inSpeech) {
      if (!speech) {
        this.preRoll.push(frame);
        this.preRollSamples += frame.length;
        let first = this.preRoll[0];
        while (first && this.preRoll.length > 1 && this.preRollSamples - first.length >= ms2s(this.o.preRollMs)) {
          this.preRollSamples -= first.length;
          this.preRoll.shift();
          first = this.preRoll[0];
        }
        return;
      }
      // speech onset
      this.inSpeech = true;
      this.uttId++;
      this.utt = this.preRoll;
      this.uttSamples = this.preRollSamples;
      this.preRoll = [];
      this.preRollSamples = 0;
      this.voicedSamples = 0;
      this.silenceSamples = 0;
      this.lastPartialSamples = 0;
    }

    this.utt.push(frame);
    this.uttSamples += frame.length;
    if (speech) {
      this.voicedSamples += frame.length;
      this.silenceSamples = 0;
    } else {
      this.silenceSamples += frame.length;
    }

    // Long utterances commit on shorter pauses so the rolling re-decode stays cheap.
    const endSilence = this.uttSamples > ms2s(8000) ? Math.min(this.o.endSilenceMs, 320) : this.o.endSilenceMs;
    if (this.silenceSamples >= ms2s(endSilence) || this.uttSamples >= ms2s(this.o.maxUtteranceMs)) {
      this.endUtterance();
      return;
    }
    if (speech) this.maybePartial();
  }

  /** Finalises whatever is buffered (e.g. on stop) and waits for all pending decodes. */
  async flush(): Promise<StreamUpdate> {
    if (this.inSpeech) this.endUtterance();
    // No partial can be in flight after this: partials don't start while a final is pending, the final clears `busy`
    // before resolving, and new audio (which is what starts partials) only arrives on a later macrotask.
    await this.finals;
    this.partial = "";
    return this.text;
  }

  private concat(): Float32Array {
    const out = new Float32Array(this.uttSamples);
    let o = 0;
    for (const f of this.utt) {
      out.set(f, o);
      o += f.length;
    }
    return out;
  }

  private maybePartial() {
    // Partials disabled (file mode). Checked explicitly: `now - lastPartialAt` starts at Infinity, and
    // `Infinity < Infinity` is false, so the interval check below would let one partial through.
    if (this.o.partialIntervalMs === Number.POSITIVE_INFINITY) return;
    if (this.busy || this.pendingFinals > 0) return; // backpressure: skip intermediate re-decodes
    const now = this.o.now();
    if (now - this.lastPartialAt < this.o.partialIntervalMs) return;
    if (this.voicedSamples < ms2s(this.o.minSpeechMs)) return;
    if (this.uttSamples - this.lastPartialSamples < ms2s(160)) return; // nothing new worth decoding
    const id = this.uttId;
    this.lastPartialAt = now;
    this.busy = true;
    yieldTask()
      .then(() => {
        if (id !== this.uttId || !this.inSpeech) return null; // finalised meanwhile
        const audio = this.concat(); // snapshot AFTER ingesting queued frames
        this.lastPartialSamples = audio.length;
        return this.o.transcribe(audio);
      })
      .then((text) => {
        if (text === null || id !== this.uttId || !this.inSpeech) return; // utterance already finalised
        this.partial = text.trim();
        this.emit();
      }, this.o.onError)
      .finally(() => {
        this.busy = false;
      });
  }

  private endUtterance() {
    const audio = this.concat();
    const voiced = this.voicedSamples;
    // Trailing silence beyond ~200 ms adds nothing.
    const trimmed = audio.subarray(0, Math.max(0, audio.length - Math.max(0, this.silenceSamples - ms2s(200))));
    this.inSpeech = false;
    this.uttId++;
    this.utt = [];
    this.uttSamples = 0;
    this.voicedSamples = 0;
    this.silenceSamples = 0;
    this.vad.reset();

    if (voiced < ms2s(this.o.minSpeechMs)) {
      this.partial = "";
      this.emit();
      return;
    }
    this.pendingFinals++;
    this.finals = this.finals.then(async () => {
      while (this.busy) await new Promise((r) => setTimeout(r, 5));
      this.busy = true;
      await yieldTask();
      try {
        this.committed = joinText(this.committed, await this.o.transcribe(trimmed));
      } catch (e) {
        this.o.onError(e);
      } finally {
        this.busy = false;
        this.pendingFinals--;
      }
      if (!this.inSpeech) this.partial = "";
      this.emit();
    });
  }

  private emit() {
    this.o.onUpdate({ committed: this.committed, partial: this.partial });
  }
}
