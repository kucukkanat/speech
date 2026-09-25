// Playback of generated speech: a jitter buffer in front of a gapless player, sentence events on the audio clock,
// and one handle (`Speech`) that is both an event emitter and a promise of the result.

import { createPlayer, encodeWav, shouldRelease } from "@kucukkanat/speech-audio";
import { createEmitter, type Emitter, SpeechError } from "@kucukkanat/speech-core";

export interface SentenceInfo {
  index: number;
  count: number;
  text: string;
}

/** A generated block of audio. The last block of each sentence has `final: true` (and may be empty). */
export interface Piece {
  sentence: SentenceInfo;
  pcm: Float32Array;
  genMs: number;
  final: boolean;
}

/**
 * - `loading`: downloading / initialising the model (first use only)
 * - `encoding`: learning the voice (first use of a voice per model)
 * - `generating`: producing the first audio
 * - `buffering`: holding audio back until enough is ready to play without pauses
 * - `playing` → `ended`, or `stopped` via stop(), or `error`
 */
export type SpeechState = "loading" | "encoding" | "generating" | "buffering" | "playing" | "ended" | "stopped" | "error";

export interface SpeechStats {
  /** Time from speak() to the first audible sample */
  ttfaMs?: number;
  /** Time spent learning the voice (only when it wasn't cached) */
  encodeMs?: number;
  /** Compute time spent generating */
  genMs: number;
  /** Seconds of audio generated */
  audioSeconds: number;
}

export type SpeechEvents = {
  state: (state: SpeechState) => void;
  /** A sentence starts playing — fired on the audio clock, so it lines up with what the listener hears. */
  sentence: (sentence: SentenceInfo) => void;
  /** Stats changed (after every generated block). */
  stats: (stats: SpeechStats) => void;
};

export interface SpeechResult {
  clip: AudioClip;
  stats: SpeechStats;
  /** True if stop() ended it early (the clip holds what was generated until then). */
  stopped: boolean;
}

/**
 * Speech in progress. `await` it (or `.done`) for the result; listen with `.on()`; `stop()` any time.
 * Note: returning a Speech from an `async` function awaits it — return `{ speech }` if you need the handle.
 */
export interface Speech extends PromiseLike<SpeechResult>, Emitter<SpeechEvents> {
  catch<T = never>(onRejected: (reason: unknown) => T | PromiseLike<T>): Promise<SpeechResult | T>;
  finally(onFinally: () => void): Promise<SpeechResult>;
  readonly state: SpeechState;
  /** The sentence currently playing, if any. */
  readonly sentence: SentenceInfo | null;
  readonly stats: SpeechStats;
  /** Live signal of what's playing, for waveforms and level meters. */
  readonly analyser: AnalyserNode;
  /** Resolves when playback ends or stop() is called; rejects on errors or when your AbortSignal fires. */
  readonly done: Promise<SpeechResult>;
  /** Stops generation and playback now. `done` resolves with `stopped: true`. */
  stop(): void;
}

export interface ClipSentence extends SentenceInfo {
  /** Seconds from the start of the clip */
  start: number;
  end: number;
}

/** Finished audio: play it again, save it, or post-process the PCM. */
export interface AudioClip {
  readonly pcm: Float32Array;
  readonly sampleRate: number;
  readonly duration: number;
  readonly sentences: readonly ClipSentence[];
  /** 16-bit mono WAV file */
  toWav(): Blob;
  play(options?: PlayOptions): Speech;
}

export interface PlayOptions {
  signal?: AbortSignal;
  audioContext?: AudioContext;
}

type PhaseState = "loading" | "encoding" | "generating";

export interface PieceSourceControl {
  signal: AbortSignal;
  setState(state: PhaseState): void;
  setEncodeMs(ms: number): void;
}

export interface PlaybackOptions {
  sampleRate: number;
  /** Length of the text being spoken, for the buffering estimate */
  totalChars: number;
  /** Hold audio back until it can play without stalling (default true). */
  buffering: boolean;
  signal?: AbortSignal | undefined;
  audioContext?: AudioContext | undefined;
}

/** How long a suspended AudioContext may take to resume before we call autoplay blocked. */
const RESUME_TIMEOUT_MS = 1500;

export function createClip(pieces: readonly Piece[], sampleRate: number): AudioClip {
  const pcm = new Float32Array(pieces.reduce((n, p) => n + p.pcm.length, 0));
  const sentences: ClipSentence[] = [];
  let offset = 0;
  for (const p of pieces) {
    pcm.set(p.pcm, offset);
    const start = offset / sampleRate;
    offset += p.pcm.length;
    const last = sentences.at(-1);
    if (last?.index === p.sentence.index) last.end = offset / sampleRate;
    else if (p.pcm.length) sentences.push({ ...p.sentence, start, end: offset / sampleRate });
  }
  const clip: AudioClip = {
    pcm,
    sampleRate,
    duration: pcm.length / sampleRate,
    sentences,
    toWav: () => encodeWav(pcm, sampleRate),
    play: (options = {}) =>
      playPieces(
        async function* () {
          for (const s of sentences) {
            const slice = pcm.subarray(Math.round(s.start * sampleRate), Math.round(s.end * sampleRate));
            yield { sentence: { index: s.index, count: s.count, text: s.text }, pcm: slice, genMs: 0, final: true };
          }
        },
        { sampleRate, totalChars: 0, buffering: false, signal: options.signal, audioContext: options.audioContext },
      ),
  };
  return clip;
}

/** Plays pieces from `source` as they arrive. The source is aborted when the speech stops. */
export function playPieces(source: (control: PieceSourceControl) => AsyncIterable<Piece>, options: PlaybackOptions): Speech {
  const t0 = performance.now();
  const events = createEmitter<SpeechEvents>();
  const player = createPlayer(options.audioContext ? { audioContext: options.audioContext } : {});
  const ctx = player.context;
  const controller = new AbortController();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const pieces: Piece[] = [];
  let state: SpeechState = "generating";
  let current: SentenceInfo | null = null;
  let stats: SpeechStats = { genMs: 0, audioSeconds: 0 };
  let settled = false;
  let resolveDone: (r: SpeechResult) => void = () => undefined;
  let rejectDone: (e: unknown) => void = () => undefined;
  const done = new Promise<SpeechResult>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  const setState = (next: SpeechState) => {
    if (next === state) return;
    state = next;
    events.emit("state", next);
  };
  const setStats = (patch: Partial<SpeechStats>) => {
    stats = { ...stats, ...patch };
    events.emit("stats", stats);
  };

  const finish = (outcome: { kind: "ended" | "stopped" } | { kind: "error"; error: unknown }) => {
    if (settled) return;
    settled = true;
    controller.abort(new DOMException("Speech finished", "AbortError"));
    for (const t of timers) clearTimeout(t);
    player.dispose();
    const result = { clip: createClip(pieces, options.sampleRate), stats, stopped: outcome.kind === "stopped" };
    if (outcome.kind === "error") {
      setState("error");
      rejectDone(outcome.error);
    } else {
      setState(outcome.kind);
      resolveDone(result);
    }
  };

  // Jitter buffer: generated pieces wait here until shouldRelease() says playback can run without stalling.
  let pending: Piece[] = [];
  let doneChars = 0;
  let doneSeconds = 0;
  let sentenceSeconds = 0;
  let scheduled = -1; // highest sentence index whose start event is scheduled
  // Generation speed is measured from when generation starts: model loading and voice encoding aren't part of it.
  let genStart = t0;

  const enqueue = (p: Piece) => {
    const { start } = player.enqueue(p.pcm, options.sampleRate);
    if (p.sentence.index <= scheduled) return;
    scheduled = p.sentence.index;
    const delayMs = Math.max(0, (start - ctx.currentTime + (ctx.outputLatency || 0)) * 1000);
    const timer = setTimeout(() => {
      timers.delete(timer);
      current = p.sentence;
      events.emit("sentence", p.sentence);
    }, delayMs);
    timers.add(timer);
  };

  const ensureAudible = async () => {
    if (ctx.state !== "suspended") return;
    await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, RESUME_TIMEOUT_MS))]);
    // Re-read through a function: TypeScript keeps `ctx.state` narrowed to "suspended", but resume() changes it.
    const stateNow = (): AudioContextState => ctx.state;
    if (stateNow() === "suspended") {
      throw new SpeechError("autoplay-blocked", "The browser blocked audio playback. Start speech from a click or key press.");
    }
  };

  const release = async (finished: boolean) => {
    const pendingSeconds = pending.reduce((n, p) => n + p.pcm.length, 0) / options.sampleRate;
    const go =
      !options.buffering ||
      shouldRelease({
        scheduledAhead: player.buffered,
        pending: pendingSeconds,
        produced: stats.audioSeconds,
        elapsed: (performance.now() - genStart) / 1000,
        totalChars: options.totalChars,
        doneChars,
        doneSeconds,
        finished,
      });
    if (!go) {
      if (pendingSeconds > 0) setState("buffering");
      return;
    }
    if (!pending.length) return;
    if (stats.ttfaMs === undefined) {
      await ensureAudible();
      setStats({ ttfaMs: performance.now() - t0 });
    }
    for (const p of pending) enqueue(p);
    pending = [];
    setState("playing");
  };

  // A player that runs dry while more audio is coming means we're back to buffering.
  player.on("playing", (playing) => {
    if (!playing && !settled && state === "playing" && pending.length) setState("buffering");
  });

  const run = async () => {
    const control: PieceSourceControl = {
      signal: controller.signal,
      setState: (s) => {
        if (s === "generating") genStart = performance.now();
        setState(s);
      },
      setEncodeMs: (ms) => setStats({ encodeMs: ms }),
    };
    for await (const piece of source(control)) {
      if (settled) return;
      const seconds = piece.pcm.length / options.sampleRate;
      sentenceSeconds += seconds;
      if (piece.final) {
        doneChars += piece.sentence.text.length;
        doneSeconds += sentenceSeconds;
        sentenceSeconds = 0;
      }
      setStats({ genMs: stats.genMs + piece.genMs, audioSeconds: stats.audioSeconds + seconds });
      if (piece.pcm.length) {
        pieces.push(piece);
        pending.push(piece);
      }
      await release(false);
    }
    if (settled) return;
    await release(true);
    if (!player.playing) return finish({ kind: "ended" });
    await new Promise<void>((resolve) => {
      const off = player.on("drained", () => {
        off();
        resolve();
      });
    });
    finish({ kind: "ended" });
  };

  const onExternalAbort = () => {
    if (settled) return;
    const reason: unknown = options.signal?.reason;
    finish({ kind: "error", error: reason });
  };
  if (options.signal?.aborted) queueMicrotask(onExternalAbort);
  options.signal?.addEventListener("abort", onExternalAbort, { once: true });
  // Start on the next microtask, so listeners attached right after speak() returns see every state change.
  Promise.resolve()
    .then(run)
    .then(
      () => options.signal?.removeEventListener("abort", onExternalAbort),
      (error: unknown) => {
        options.signal?.removeEventListener("abort", onExternalAbort);
        // Errors caused by our own stop()/finish() aborting the source are expected; everything else is real.
        if (!settled) finish({ kind: "error", error });
      },
    );

  return {
    on: events.on,
    get state() {
      return state;
    },
    get sentence() {
      return current;
    },
    get stats() {
      return stats;
    },
    analyser: player.analyser,
    done,
    // biome-ignore lint/suspicious/noThenProperty: Speech is deliberately thenable so `await tts.speak(…)` works.
    then: (onFulfilled, onRejected) => done.then(onFulfilled, onRejected),
    catch: (onRejected) => done.catch(onRejected),
    finally: (onFinally) => done.finally(onFinally),
    stop: () => finish({ kind: "stopped" }),
  };
}
