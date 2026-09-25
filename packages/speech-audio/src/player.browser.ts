import { createEmitter, type Emitter } from "@kucukkanat/speech-core";

let shared: AudioContext | null = null;

/**
 * The app-wide AudioContext, created lazily. Browsers start contexts suspended until a user gesture, so call this (or
 * anything that plays) from a click/keypress handler the first time.
 */
export function getAudioContext(): AudioContext {
  if (!shared || shared.state === "closed") shared = new AudioContext({ latencyHint: "interactive" });
  if (shared.state === "suspended") void shared.resume();
  return shared;
}

/** When a queued block will play, on the AudioContext clock (seconds). */
export interface ScheduledAudio {
  start: number;
  end: number;
}

export type PlayerEvents = {
  /** Playback started (true) or the queue drained / was stopped (false). */
  playing: (playing: boolean) => void;
  /** The queue played to the end (not fired by stop()). */
  drained: () => void;
};

export interface AudioPlayer extends Emitter<PlayerEvents> {
  readonly context: AudioContext;
  /** Tap for waveforms and level meters; stays connected across stop(). */
  readonly analyser: AnalyserNode;
  /** Seconds of audio scheduled but not yet played. */
  readonly buffered: number;
  readonly playing: boolean;
  /** Queues PCM to start right after everything already queued (gapless). */
  enqueue(pcm: Float32Array, sampleRate: number): ScheduledAudio;
  /** Stops immediately and clears the queue. */
  stop(): void;
  /** Stops and detaches from the audio graph; the player can't be used afterwards. */
  dispose(): void;
}

export interface PlayerOptions {
  /** Share a context with the rest of your app. Default: {@link getAudioContext}. */
  audioContext?: AudioContext;
  /** Delay before the first block when starting from silence, so its start isn't clipped. Default 0.05 s. */
  leadIn?: number;
}

/** A gapless streaming player: enqueue PCM blocks as they are generated and they play back-to-back. */
export function createPlayer(options: PlayerOptions = {}): AudioPlayer {
  const ctx = options.audioContext ?? getAudioContext();
  const leadIn = options.leadIn ?? 0.05;
  const events = createEmitter<PlayerEvents>();
  const gain = ctx.createGain();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;
  gain.connect(analyser).connect(ctx.destination);

  const sources = new Set<AudioBufferSourceNode>();
  let nextTime = 0;
  let playing = false;
  let generation = 0; // invalidates `onended` callbacks of sources stopped by stop()

  const setPlaying = (p: boolean) => {
    if (p === playing) return;
    playing = p;
    events.emit("playing", p);
  };

  return {
    on: events.on,
    context: ctx,
    analyser,
    get buffered() {
      return Math.max(0, nextTime - ctx.currentTime);
    },
    get playing() {
      return playing;
    },
    enqueue(pcm, sampleRate) {
      if (ctx.state === "suspended") void ctx.resume();
      const buffer = ctx.createBuffer(1, Math.max(1, pcm.length), sampleRate);
      buffer.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(gain);
      const start = Math.max(nextTime, ctx.currentTime + leadIn);
      src.start(start);
      nextTime = start + buffer.duration;
      sources.add(src);
      const gen = generation;
      src.onended = () => {
        sources.delete(src);
        if (gen !== generation || sources.size) return;
        setPlaying(false);
        events.emit("drained");
      };
      setPlaying(true);
      return { start, end: nextTime };
    },
    stop() {
      generation++;
      for (const s of sources) {
        s.onended = null;
        s.stop();
        s.disconnect();
      }
      sources.clear();
      nextTime = 0;
      setPlaying(false);
    },
    dispose() {
      this.stop();
      gain.disconnect();
      analyser.disconnect();
    },
  };
}
