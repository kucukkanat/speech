import { createChannel, createEmitter, type Emitter } from "@kucukkanat/speech-core";
import { assertMicSupported, toMicError } from "./mic-errors.js";
import { rms } from "./wav.js";
import { micWorkletSource } from "./worklet.browser.js";

const PROCESSOR = "kucukkanat-mic";

export interface MicrophoneOptions {
  /** Output sample rate of the frames. Default 16000 (what speech models expect). */
  sampleRate?: number;
  /** Samples per frame. Default 1280 (80 ms at 16 kHz). */
  frameSize?: number;
  /** Extra getUserMedia audio constraints, e.g. `{ deviceId }`. Echo cancellation, noise suppression and AGC are on. */
  constraints?: MediaTrackConstraints;
  /** Closes the microphone when aborted. */
  signal?: AbortSignal;
  /**
   * Load the worklet from this URL instead of a Blob URL, for Content-Security-Policies without `blob:`. Serve the
   * output of `micWorkletSource()` from your own origin.
   */
  workletUrl?: string | URL;
}

export type MicrophoneEvents = {
  /** RMS level (0..1) of every frame */
  level: (level: number) => void;
  closed: () => void;
};

/** A live microphone. Iterate it to receive mono PCM frames: `for await (const frame of mic) …` */
export interface Microphone extends AsyncIterable<Float32Array>, Emitter<MicrophoneEvents> {
  readonly sampleRate: number;
  readonly frameSize: number;
  readonly closed: boolean;
  /** Stops capture and ends iteration. Idempotent. */
  close(): void;
}

/**
 * Asks for microphone permission and starts capturing. Rejects with a SpeechError: `mic-permission-denied`,
 * `mic-not-found`, `mic-busy`, `mic-unsupported`, `mic-insecure-context` or `mic-unknown`.
 */
export async function openMicrophone(options: MicrophoneOptions = {}): Promise<Microphone> {
  const { sampleRate = 16000, frameSize = 1280, constraints = {}, signal, workletUrl } = options;
  signal?.throwIfAborted();
  assertMicSupported({
    isSecureContext: globalThis.isSecureContext,
    hasGetUserMedia: typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function",
    hasAudioWorklet: typeof AudioWorkletNode === "function",
  });

  const stream = await navigator.mediaDevices
    .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, ...constraints } })
    .catch((e: unknown) => {
      throw toMicError(e);
    });
  // A native-rate context (Firefox refuses to connect a mic to a context at another rate); the worklet resamples.
  const ctx = new AudioContext({ latencyHint: "interactive" });
  const stopTracks = () => {
    for (const t of stream.getTracks()) t.stop();
  };

  let node: AudioWorkletNode;
  try {
    const url =
      workletUrl ?? URL.createObjectURL(new Blob([micWorkletSource(PROCESSOR, frameSize, sampleRate)], { type: "text/javascript" }));
    await ctx.audioWorklet.addModule(url);
    if (!workletUrl) URL.revokeObjectURL(String(url));
    if (ctx.state === "suspended") await ctx.resume();
    node = new AudioWorkletNode(ctx, PROCESSOR, { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: "explicit" });
    // Keep the graph pulled without making a sound.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    ctx.createMediaStreamSource(stream).connect(node).connect(mute).connect(ctx.destination);
  } catch (e) {
    stopTracks();
    void ctx.close();
    throw toMicError(e);
  }

  const frames = createChannel<Float32Array>();
  const events = createEmitter<MicrophoneEvents>();
  let closed = false;
  node.port.onmessage = (e: MessageEvent<{ pcm: Float32Array }>) => {
    events.emit("level", rms(e.data.pcm));
    frames.push(e.data.pcm);
  };

  const close = () => {
    if (closed) return;
    closed = true;
    node.port.postMessage("stop");
    node.port.onmessage = null;
    node.disconnect();
    stopTracks();
    void ctx.close();
    frames.close();
    events.emit("closed");
  };
  signal?.addEventListener("abort", close, { once: true });
  // The consumer breaking out of `for await` means it no longer wants audio.
  frames.onReturn(close);

  return {
    sampleRate,
    frameSize,
    get closed() {
      return closed;
    },
    on: events.on,
    close,
    [Symbol.asyncIterator]: () => frames[Symbol.asyncIterator](),
  };
}
