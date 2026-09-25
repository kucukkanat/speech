import { createEmitter, type Emitter } from "@kucukkanat/speech-core";
import { createLevelMeter } from "./level.browser.js";
import { assertMicSupported, toMicError } from "./mic-errors.js";

export interface RecordingOptions {
  /** Stops automatically after this many seconds. Default 15. */
  maxSeconds?: number;
  constraints?: MediaTrackConstraints;
  /** Aborting cancels the recording: `done` rejects with the signal's reason. */
  signal?: AbortSignal;
}

export type RecordingEvents = {
  /** RMS input level (0..1), once per animation frame */
  level: (level: number) => void;
  /** Seconds recorded so far, once per animation frame */
  time: (seconds: number) => void;
};

export interface Recording extends Emitter<RecordingEvents> {
  readonly elapsed: number;
  /** Finishes the recording; `done` resolves with the audio. */
  stop(): void;
  /** The recorded clip (webm/opus, mp4 or ogg — whatever the browser records), once stopped or at `maxSeconds`. */
  readonly done: Promise<Blob>;
}

const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];

/** Records a compressed clip from the microphone, with live level and elapsed time for UI. */
export async function startRecording(options: RecordingOptions = {}): Promise<Recording> {
  const { maxSeconds = 15, constraints = {}, signal } = options;
  signal?.throwIfAborted();
  assertMicSupported({
    isSecureContext: globalThis.isSecureContext,
    hasGetUserMedia: typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function",
    hasAudioWorklet: typeof MediaRecorder === "function",
  });
  const stream = await navigator.mediaDevices
    .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, ...constraints } })
    .catch((e: unknown) => {
      throw toMicError(e);
    });

  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const mimeType = MIME_TYPES.find((m) => MediaRecorder.isTypeSupported(m));
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const parts: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) parts.push(e.data);
  };

  const events = createEmitter<RecordingEvents>();
  const t0 = performance.now();
  let elapsed = 0;
  const stopMeter = createLevelMeter(analyser, (level) => {
    events.emit("level", level);
    elapsed = (performance.now() - t0) / 1000;
    events.emit("time", elapsed);
    if (elapsed >= maxSeconds && recorder.state === "recording") recorder.stop();
  });
  const release = () => {
    stopMeter();
    for (const t of stream.getTracks()) t.stop();
    void ctx.close();
  };

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      release();
      if (signal?.aborted) reject(signal.reason);
      else resolve(new Blob(parts, { type: recorder.mimeType || "audio/webm" }));
    };
    recorder.onerror = (e) => {
      release();
      reject(toMicError((e as Event & { error?: unknown }).error ?? e));
    };
  });
  signal?.addEventListener("abort", () => recorder.state !== "inactive" && recorder.stop(), { once: true });
  recorder.start(250);

  return {
    on: events.on,
    get elapsed() {
      return elapsed;
    },
    stop: () => {
      if (recorder.state !== "inactive") recorder.stop();
    },
    done,
  };
}
