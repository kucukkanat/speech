import {
  type ConditioningCache,
  createChannel,
  createEngineCore,
  createRpcClient,
  type Device,
  type EngineStatus,
  type LoadOptions,
  type SpeakerConditioning,
  SpeechError,
  type TransformersOptions,
} from "@kucukkanat/speech-core";
import {
  EXAGGERATION,
  isTtsModelKey,
  type ModelOptionsFor,
  type Sampling,
  TTS_MODELS,
  type TtsModelInfo,
  type TtsModelKey,
  validateSampling,
} from "./models.js";
import { SAMPLE_RATE, type TtsBroadcast, type TtsProtocol } from "./protocol.js";
import { spawnTtsWorker } from "./spawn.js";
import { type AudioClip, createClip, type Piece, playPieces, type SentenceInfo, type Speech } from "./speech.browser.js";
import { conditioningKey, createMemoryCache, DEFAULT_VOICE_PATH, type VoiceInput, voiceAudio, voiceId } from "./voice.js";

export interface TTSOptions<M extends TtsModelKey = TtsModelKey> {
  /** Which model to run. Default "chatterbox-turbo". */
  model?: M;
  /** "auto" (default) picks WebGPU when available, else WASM. */
  device?: Device | "auto";
  /** Where encoded voices are kept. Default: in memory. Pass `voiceStore.conditioningCache` from @kucukkanat/voices to persist. */
  cache?: ConditioningCache;
  /** Voice used when speak() gets none. Default: the reference speaker shipped with Chatterbox. */
  defaultVoice?: VoiceInput;
  /** Share an AudioContext with the rest of your app. */
  audioContext?: AudioContext;
  /** Self-host models or ONNX Runtime files (strict CSP, offline). */
  transformers?: TransformersOptions;
  /** Custom worker factory, for bundlers that can't handle `new Worker(new URL(…))` in dependencies. */
  worker?: () => Worker;
}

interface CommonOptions {
  /** A voice to clone (URL, File/Blob, PCM, or `{ id, audio }`). Default: the model's reference speaker. */
  voice?: VoiceInput;
  /** Cancels the call: the promise rejects with the signal's reason. */
  signal?: AbortSignal;
  /** Override any of the model's token sampling (`tts.model.sampling`), e.g. `{ temperature: 0.6 }` for a steadier read. */
  sampling?: Partial<Sampling>;
}

export type SpeakOptions<M extends TtsModelKey = TtsModelKey> = CommonOptions &
  ModelOptionsFor<M> & {
    /** Hold audio back until it can play without pauses (default true). Turn off for lowest latency. */
    buffering?: boolean;
  };

export type GenerateOptions<M extends TtsModelKey = TtsModelKey> = CommonOptions & ModelOptionsFor<M>;

/** A block of generated audio from {@link TextToSpeech.stream}. */
export interface AudioChunk {
  pcm: Float32Array;
  sampleRate: number;
  sentence: SentenceInfo;
  /** Last block of its sentence (may be empty). */
  final: boolean;
}

export interface TextToSpeech<M extends TtsModelKey = TtsModelKey> {
  /** The selected model and what it supports. */
  readonly model: TtsModelInfo<M>;
  /** Every model this SDK can run. */
  readonly models: readonly TtsModelInfo[];
  /** Current lifecycle state (a stable snapshot; works with React's useSyncExternalStore). */
  readonly status: EngineStatus<TtsModelKey>;
  /** Calls `listener` whenever `status` changes. Returns an unsubscribe function. */
  readonly subscribe: (listener: (status: EngineStatus<TtsModelKey>) => void) => () => void;
  /** Downloads and initialises the model. Optional: every other method loads on first use. */
  load(options?: LoadOptions): Promise<void>;
  /** Selects and loads another model (the previous one is released from GPU memory). */
  switchModel<K extends TtsModelKey>(model: K, options?: LoadOptions): Promise<TextToSpeech<K>>;
  /** Learns a voice ahead of time so the first speak() with it starts faster. */
  prepare(voice?: VoiceInput, options?: { signal?: AbortSignal }): Promise<void>;
  /** Speaks `text` out loud, streaming as it generates. Await the result or use the handle's events. */
  speak(text: string, options?: SpeakOptions<M>): Speech;
  /** Generates audio without playing it, as blocks you can iterate over. Breaking out of the loop cancels generation. */
  stream(text: string, options?: GenerateOptions<M>): AsyncIterable<AudioChunk>;
  /** Generates the whole text and returns it as a clip. */
  synthesize(text: string, options?: GenerateOptions<M>): Promise<AudioClip>;
  /** Frees the model's memory; the next call loads it again. */
  unload(): Promise<void>;
  /** Stops the worker. The instance can't be used afterwards. */
  dispose(): void;
}

/**
 * Creates a text-to-speech engine. Nothing is downloaded until the first call (or {@link TextToSpeech.load}).
 *
 * ```ts
 * const tts = createTTS();
 * await tts.speak("Hello from your browser!");
 * ```
 */
export function createTTS<M extends TtsModelKey = "chatterbox-turbo">(options: TTSOptions<M> = {}): TextToSpeech<M> {
  const initial: TtsModelKey = options.model ?? "chatterbox-turbo";
  if (!isTtsModelKey(initial))
    throw new SpeechError("unknown-model", `Unknown TTS model "${String(initial)}". Use one of: ${Object.keys(TTS_MODELS).join(", ")}.`);
  const cache = options.cache ?? createMemoryCache();
  const transformers = options.transformers ?? {};
  const defaultVoice = options.defaultVoice ?? `${transformers.remoteHost ?? "https://huggingface.co/"}${DEFAULT_VOICE_PATH}`;
  const rpc = createRpcClient<TtsProtocol, TtsBroadcast>(options.worker ?? spawnTtsWorker);
  const core = createEngineCore<TtsModelKey>({
    model: initial,
    loadModel: (model) => rpc.call("load", { model, device: options.device ?? "auto", transformers }),
    onProgress: (listener) => rpc.onBroadcast((b) => listener(b.model, b.progress)),
    onCrash: (listener) => rpc.onCrash(listener),
  });
  const load = core.load;
  const encoding = new Map<string, Promise<SpeakerConditioning>>();

  const validate = (text: string, extra: { exaggeration?: number | undefined; sampling?: Partial<Sampling> | undefined }) => {
    if (!text.trim()) throw new SpeechError("empty-text", "There's no text to speak.");
    if (extra.sampling) validateSampling(extra.sampling);
    const { exaggeration } = extra;
    if (exaggeration === undefined) return;
    if (!TTS_MODELS[core.selected].supports.exaggeration) {
      throw new SpeechError(
        "unsupported-option",
        `${TTS_MODELS[core.selected].label} doesn't support \`exaggeration\`; check tts.model.supports first.`,
      );
    }
    if (!(exaggeration >= EXAGGERATION.min && exaggeration <= EXAGGERATION.max)) {
      throw new SpeechError(
        "unsupported-option",
        `\`exaggeration\` must be between ${EXAGGERATION.min} and ${EXAGGERATION.max} (got ${exaggeration}).`,
      );
    }
  };

  /** Encoded voice for the selected model: from the cache, or encoded now (concurrent requests share one job). */
  const conditioning = async (voice: VoiceInput, signal: AbortSignal | undefined, onEncode?: (ms: number) => void) => {
    const key = conditioningKey(await voiceId(voice), TTS_MODELS[core.selected].repo);
    const cached = await cache.get(key);
    if (cached) return cached;
    let job = encoding.get(key);
    if (!job) {
      const t0 = performance.now();
      job = voiceAudio(voice, signal)
        .then(({ pcm, sampleRate }) => {
          const copy = pcm.slice(); // the caller keeps its audio; we move the copy
          return rpc.call("encode", { pcm: copy, sampleRate }, { transfer: [copy.buffer] });
        })
        .then(async (c) => {
          await cache.set(key, c);
          onEncode?.(performance.now() - t0);
          return c;
        })
        .catch((e: unknown) => {
          throw e instanceof SpeechError
            ? e
            : new SpeechError("invalid-voice", `Could not use this voice: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
        })
        .finally(() => encoding.delete(key));
      encoding.set(key, job);
    }
    return job;
  };

  /** Loads, encodes the voice, then streams generated pieces (the shared engine behind speak, stream, synthesize). */
  async function* generate(
    text: string,
    opts: CommonOptions & { exaggeration?: number | undefined },
    control: { signal: AbortSignal; setState?: (s: "loading" | "encoding" | "generating") => void; setEncodeMs?: (ms: number) => void },
  ): AsyncGenerator<Piece> {
    validate(text, opts);
    const s = core.status.get();
    if (s.state !== "ready" || s.model !== core.selected) {
      control.setState?.("loading");
      await load({ signal: control.signal });
    }
    control.setState?.("encoding");
    const c = await conditioning(opts.voice ?? defaultVoice, control.signal, control.setEncodeMs);
    control.setState?.("generating");
    const pieces = createChannel<Piece>();
    const call = rpc.call(
      "generate",
      {
        text,
        conditioning: c,
        ...(opts.exaggeration !== undefined ? { exaggeration: opts.exaggeration } : {}),
        ...(opts.sampling ? { sampling: opts.sampling } : {}),
      },
      { signal: control.signal, onEvent: (p) => pieces.push(p) },
    );
    call.then(
      () => pieces.close(),
      (e: unknown) => pieces.fail(e),
    );
    yield* pieces;
  }

  const linked = (signal: AbortSignal | undefined) => {
    const controller = new AbortController();
    if (signal) {
      if (signal.aborted) controller.abort(signal.reason);
      else signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
    }
    return controller;
  };

  const engine: TextToSpeech<TtsModelKey> = {
    get model() {
      return TTS_MODELS[core.selected];
    },
    models: Object.values(TTS_MODELS),
    get status() {
      return core.status.get();
    },
    subscribe: core.status.subscribe,
    load,
    async switchModel(model, loadOptions) {
      if (!isTtsModelKey(model)) throw new SpeechError("unknown-model", `Unknown TTS model "${String(model)}".`);
      core.select(model);
      if (core.status.get().state !== "idle") await load(loadOptions);
      // Same instance, re-typed for the new model so its options type-check.
      return engine as unknown as TextToSpeech<typeof model>;
    },
    async prepare(voice, prepareOptions = {}) {
      await load(prepareOptions);
      await conditioning(voice ?? defaultVoice, prepareOptions.signal);
    },
    speak(text, speakOptions = {}) {
      const { buffering = true, signal, ...rest } = speakOptions;
      return playPieces((control) => generate(text, rest, control), {
        sampleRate: SAMPLE_RATE,
        totalChars: text.length,
        buffering,
        signal,
        audioContext: options.audioContext,
      });
    },
    stream(text, streamOptions = {}) {
      return {
        [Symbol.asyncIterator]: () => {
          const controller = linked(streamOptions.signal);
          const inner = generate(text, streamOptions, { signal: controller.signal });
          return {
            next: async () => {
              const r = await inner.next();
              if (r.done) return { done: true, value: undefined };
              const { pcm, sentence, final } = r.value;
              return { done: false, value: { pcm, sampleRate: SAMPLE_RATE, sentence, final } };
            },
            return: async () => {
              controller.abort(new DOMException("Stream closed by the consumer", "AbortError"));
              await inner.return(undefined);
              return { done: true, value: undefined };
            },
          };
        },
      };
    },
    async synthesize(text, synthOptions = {}) {
      const controller = linked(synthOptions.signal);
      const pieces: Piece[] = [];
      for await (const p of generate(text, synthOptions, { signal: controller.signal })) pieces.push(p);
      return createClip(pieces, SAMPLE_RATE);
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
  return engine as unknown as TextToSpeech<M>;
}
