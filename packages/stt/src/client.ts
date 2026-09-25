import { type Microphone, type MicrophoneOptions, openMicrophone } from "@kucukkanat/speech-audio";
import {
  createChannel,
  createEmitter,
  createEngineCore,
  createRpcClient,
  type Device,
  type Emitter,
  type EmitterController,
  type EngineStatus,
  type LoadOptions,
  SpeechError,
  type TransformersOptions,
} from "@kucukkanat/speech-core";
import { type AudioStream, isStream, type TranscribeInput, toFrames } from "./input.js";
import { joinText, type StreamUpdate } from "./internal/text.js";
import { isSttModelKey, STT_MODELS, type SttModelInfo, type SttModelKey } from "./models.js";
import type { SttBroadcast, SttProtocol } from "./protocol.js";
import { spawnSttWorker } from "./spawn.js";

export interface STTOptions<M extends SttModelKey = SttModelKey> {
  /** Which model to run. Default "moonshine-base" (small, runs everywhere). */
  model?: M;
  /** "auto" (default) picks WebGPU when available, else WASM. */
  device?: Device | "auto";
  /** Self-host models or ONNX Runtime files (strict CSP, offline). */
  transformers?: TransformersOptions;
  /** Custom worker factory, for bundlers that can't handle `new Worker(new URL(…))` in dependencies. */
  worker?: () => Worker;
}

/** The transcript so far. `committed` never changes again; `partial` is a live guess that may still be revised. */
export interface TranscriptUpdate {
  /** committed + partial, ready to display */
  text: string;
  committed: string;
  partial: string;
}

export interface Transcript {
  text: string;
  /** False when stop() gave up waiting for the model (see `stopTimeoutMs`); `text` is what was recognised by then. */
  complete: boolean;
}

export interface TranscribeOptions {
  /** Cancels the transcription: the session rejects with the signal's reason. */
  signal?: AbortSignal;
  /** How long stop() waits for the last words before returning an incomplete transcript. Default 15 000 ms. */
  stopTimeoutMs?: number;
}

export type ListenOptions = TranscribeOptions & Pick<MicrophoneOptions, "constraints" | "workletUrl">;

export type SessionEvents = {
  update: (update: TranscriptUpdate) => void;
  /** Microphone input level (0..1) — only for live microphone sessions. */
  level: (level: number) => void;
};

/**
 * A running transcription. `await` it for the final transcript, listen to `update`s, or iterate:
 * `for await (const { text } of session) …`. Finite inputs end on their own; live ones when you call stop().
 */
export interface TranscriptionSession extends PromiseLike<Transcript>, Emitter<SessionEvents>, AsyncIterable<TranscriptUpdate> {
  catch<T = never>(onRejected: (reason: unknown) => T | PromiseLike<T>): Promise<Transcript | T>;
  finally(onFinally: () => void): Promise<Transcript>;
  /** The latest transcript. */
  readonly current: TranscriptUpdate;
  /** Resolves once audio is flowing (model loaded, microphone open) — the moment to show "listening". Rejects if the session fails first. */
  readonly ready: Promise<void>;
  readonly done: Promise<Transcript>;
  /** Stops reading input, waits for the last words and resolves the final transcript. */
  stop(): Promise<Transcript>;
}

export interface SpeechToText<M extends SttModelKey = SttModelKey> {
  readonly model: SttModelInfo<M>;
  readonly models: readonly SttModelInfo[];
  /** Current lifecycle state (a stable snapshot; works with React's useSyncExternalStore). */
  readonly status: EngineStatus<SttModelKey>;
  readonly subscribe: (listener: (status: EngineStatus<SttModelKey>) => void) => () => void;
  /** Downloads and initialises the model. Optional: transcribe() and listen() load on first use. */
  load(options?: LoadOptions): Promise<void>;
  switchModel<K extends SttModelKey>(model: K, options?: LoadOptions): Promise<SpeechToText<K>>;
  /** Transcribes a recording (URL, File/Blob, bytes, PCM) or a live stream of 16 kHz frames. One session at a time. */
  transcribe(input: TranscribeInput, options?: TranscribeOptions): TranscriptionSession;
  /**
   * Transcribes the microphone live. Returns immediately: the model loads first, then the microphone opens (await
   * `session.ready` for that moment). Call `stop()` to finish.
   */
  listen(options?: ListenOptions): TranscriptionSession;
  unload(): Promise<void>;
  dispose(): void;
}

const EMPTY: TranscriptUpdate = { text: "", committed: "", partial: "" };
const toUpdate = (u: StreamUpdate): TranscriptUpdate => ({ ...u, text: joinText(u.committed, u.partial) });

/**
 * Creates a speech-to-text engine. Nothing is downloaded until the first call (or {@link SpeechToText.load}).
 *
 * ```ts
 * const stt = createSTT();
 * const session = await stt.listen();
 * session.on("update", ({ text }) => console.log(text));
 * ```
 */
export function createSTT<M extends SttModelKey = "moonshine-base">(options: STTOptions<M> = {}): SpeechToText<M> {
  const initial: SttModelKey = options.model ?? "moonshine-base";
  if (!isSttModelKey(initial))
    throw new SpeechError("unknown-model", `Unknown STT model "${String(initial)}". Use one of: ${Object.keys(STT_MODELS).join(", ")}.`);
  const transformers = options.transformers ?? {};
  const rpc = createRpcClient<SttProtocol, SttBroadcast>(options.worker ?? spawnSttWorker);
  const core = createEngineCore<SttModelKey>({
    model: initial,
    loadModel: (model) => rpc.call("load", { model, device: options.device ?? "auto", transformers }),
    onProgress: (listener) => rpc.onBroadcast((b) => listener(b.model, b.progress)),
    onCrash: (listener) => rpc.onCrash(listener),
  });
  let active: TranscriptionSession | null = null;
  /** Each session's emitter, so listen() can add microphone levels to the same event stream. */
  const emitters = new WeakMap<TranscriptionSession, EmitterController<SessionEvents>>();

  const transcribe = (input: TranscribeInput, opts: TranscribeOptions = {}, hooks: { onStop?: () => void } = {}): TranscriptionSession => {
    const { signal, stopTimeoutMs = 15_000 } = opts;
    const events = createEmitter<SessionEvents>();
    const updates = createChannel<TranscriptUpdate>();
    const controller = new AbortController();
    const live = isStream(input);
    let current = EMPTY;
    let stopping = false;
    let resolveStopRequested: () => void = () => undefined;
    let resolveReady: () => void = () => undefined;
    let rejectReady: (e: unknown) => void = () => undefined;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const stopRequested = new Promise<void>((r) => {
      resolveStopRequested = r;
    });

    const onUpdate = (u: StreamUpdate) => {
      current = toUpdate(u);
      events.emit("update", current);
      updates.push(current);
    };

    const run = async (): Promise<Transcript> => {
      if (active) throw new SpeechError("busy", "A transcription is already running; stop it first.");
      active = session;
      try {
        await core.load({ signal: controller.signal });
        const opened = rpc.call("open", { live }, { signal: controller.signal, onEvent: onUpdate });
        const feed = (async () => {
          for await (const pcm of toFrames(input, controller.signal)) {
            resolveReady();
            if (stopping) break;
            // Ordered by the worker's message queue; awaiting each would only add latency.
            rpc.call("push", { pcm }, { transfer: [pcm.buffer] }).catch((e: unknown) => controller.abort(e));
          }
        })();
        // `opened` only settles early on failure (e.g. a transcription error): surface it without feeding more audio.
        await Promise.race([feed, opened, stopRequested]);
        hooks.onStop?.();
        await rpc.call("end", undefined);
        const timeout = new Promise<null>((r) => setTimeout(() => r(null), stopTimeoutMs));
        const final = await Promise.race([opened, timeout]);
        if (final) onUpdate(final);
        return { text: current.text, complete: final !== null };
      } finally {
        // Ends the worker-side session too if we got here through an error (a finished one is unaffected).
        controller.abort(new DOMException("Transcription finished", "AbortError"));
        if (active === session) active = null;
        updates.close();
      }
    };

    const onAbort = () => controller.abort(signal?.reason);
    if (signal?.aborted) controller.abort(signal.reason);
    else signal?.addEventListener("abort", onAbort, { once: true });
    // Start on the next microtask: `session` is defined by then, and listeners attached right after transcribe()
    // returns see every update.
    const done = Promise.resolve()
      .then(run)
      .finally(() => signal?.removeEventListener("abort", onAbort));
    // `ready` settles with the session: a failure before audio flows (mic denied, model error) rejects it too. It only
    // repeats `done`'s outcome, so an unawaited `ready` isn't reported as a second unhandled rejection.
    done.then(() => resolveReady(), rejectReady);
    ready.catch(() => undefined);

    const session: TranscriptionSession = {
      on: events.on,
      get current() {
        return current;
      },
      ready,
      done,
      // biome-ignore lint/suspicious/noThenProperty: sessions are deliberately thenable so `await stt.transcribe(…)` works.
      then: (onFulfilled, onRejected) => done.then(onFulfilled, onRejected),
      catch: (onRejected) => done.catch(onRejected),
      finally: (onFinally) => done.finally(onFinally),
      stop: () => {
        stopping = true;
        resolveStopRequested();
        return done;
      },
      [Symbol.asyncIterator]: () => updates[Symbol.asyncIterator](),
    };
    emitters.set(session, events);
    return session;
  };

  const engine: SpeechToText<SttModelKey> = {
    get model() {
      return STT_MODELS[core.selected];
    },
    models: Object.values(STT_MODELS),
    get status() {
      return core.status.get();
    },
    subscribe: core.status.subscribe,
    load: core.load,
    async switchModel(model, loadOptions) {
      if (!isSttModelKey(model)) throw new SpeechError("unknown-model", `Unknown STT model "${String(model)}".`);
      if (active) throw new SpeechError("busy", "Stop the running transcription before switching models.");
      core.select(model);
      if (core.status.get().state !== "idle") await core.load(loadOptions);
      // Same instance, re-typed for the new model.
      return engine as unknown as SpeechToText<typeof model>;
    },
    transcribe: (input, opts) => transcribe(input, opts),
    listen(opts = {}) {
      let mic: Microphone | null = null;
      const close = () => mic?.close();
      // Opened lazily, when transcribe() starts reading — i.e. after the model has loaded, so the microphone isn't
      // live (with its privacy indicator on) during a long download.
      const stream: AudioStream = {
        sampleRate: 16000,
        async *[Symbol.asyncIterator]() {
          mic = await openMicrophone({
            ...(opts.constraints ? { constraints: opts.constraints } : {}),
            ...(opts.workletUrl ? { workletUrl: opts.workletUrl } : {}),
            ...(opts.signal ? { signal: opts.signal } : {}),
          });
          mic.on("level", (level) => emitters.get(session)?.emit("level", level));
          yield* mic;
        },
      };
      const session = transcribe(stream, opts, { onStop: close });
      // Release the microphone however the session ends; its outcome still reaches whoever awaits the session.
      session.done.then(close, close);
      return session;
    },
    async unload() {
      await rpc.call("unload", undefined);
      core.reset();
    },
    dispose() {
      rpc.dispose();
      core.reset();
    },
  };
  return engine as unknown as SpeechToText<M>;
}
