/// <reference lib="webworker" />
// Chatterbox TTS worker (transformers.js 4.3, ChatterboxModel) — Turbo or the original, one loaded at a time.
//
// Pipeline (see node_modules/@huggingface/transformers/src/models/chatterbox/modeling_chatterbox.js):
//   encode_speech(audio_values[1,N] @24k) -> { audio_features, audio_tokens, speaker_embeddings, speaker_features }
//   language model: text + speaker prompt -> speech tokens @25 Hz (sampled, see Sampling)
//   conditional_decoder(reference prompt tokens + speech tokens, speaker) -> waveform @24k
// When all four speaker tensors are passed, forward() skips the speech encoder, so conditioning is computed once per
// voice, serialised, cached by the client and reused for every generate().
//
// Instead of ChatterboxModel.generate (tokens first, then one vocoder pass per sentence), we run the language model
// ourselves and vocode the token stream in overlapping windows *between* LM steps (see ./internal/stitcher.ts), so
// audio starts after ~15 tokens and flows while the rest of the sentence is still being generated.
import {
  AutoTokenizer,
  BaseStreamer,
  ChatterboxModel,
  env,
  LogitsProcessor,
  PreTrainedModel,
  type PreTrainedTokenizer,
  StoppingCriteria,
  Tensor,
} from "@huggingface/transformers";
import { resample } from "@kucukkanat/speech-audio";
import {
  createSerialQueue,
  type Device,
  exposeRpc,
  type LoadProgress,
  onnxDevice,
  probeDevice,
  type SpeakerConditioning,
  SpeechError,
} from "@kucukkanat/speech-core";
import { filterMinP, filterTopP, isDegenerate, maxNewTokens, penalizeRepeats } from "./internal/decoding.js";
import { initialStitchState, nextWindow, type StitchConfig, stitch } from "./internal/stitcher.js";
import { normalizeText, splitText } from "./internal/text.js";
import { TTS_MODELS, type TtsModelKey } from "./models.js";
import { SAMPLE_RATE, type TtsBroadcast, type TtsProtocol } from "./protocol.js";

const MAX_REF_SECONDS = 20;
/** Speech-token ids are 0..6560; 6561/6562 are start/stop-of-speech. */
const SPEECH_VOCAB = 6561n;
const SILENCE_TOKEN = 4299n;
/**
 * Reference tokens given to the vocoder on every window. It re-processes them each call, so they dominate the cost of
 * short windows. Measured (Aria, Turbo): 5 s kept speaker similarity at the full-clip level (0.75 vs 0.76, WeSpeaker
 * cosine) and transcripts word-perfect; 3 s lost ~0.05 similarity. Trimming must be start-aligned (tokens [0,K) with
 * mel frames [0,2K)) — the clip has one token more than it has frame pairs, and end-aligned slices garble the output.
 */
const VOCODER_PROMPT_TOKENS = 125;

/* ------------------------------ dtypes ------------------------------ */
// All four graphs have fp32 I/O in every variant (checked with onnx), so any mix is valid and the
// cached conditioning is independent of the encoder dtype.
//
// Turbo on WebGPU (shader-f16):
//  - language_model q4f16 (184 MB): the autoregressive loop is memory-bandwidth bound; 4-bit weights +
//    fp16 KV cache is the fastest option and the quality loss on a 350M GPT-2 is negligible.
//  - embed_tokens fp16 (116 MB): a pure Gather — quantising the table saves little time but costs precision.
//  - speech_encoder q4f16 (177 MB): runs once per voice; only its MatMuls are 4-bit (convs/fbank stay fp16).
//    fp16 (522 MB) would triple the download for a one-off step.
//  - conditional_decoder q4 (246 MB): must keep fp32 activations. Both fp16 and q4f16 overflow on WebGPU —
//    the first ~0.5 s sounds right, then the waveform collapses into low-level noise/silence (measured:
//    frame RMS drops from ~0.2 to ~0.02). q4 weights with fp32 activations match the fp32 graph's output.
//  Total ≈ 0.72 GB.
// WebGPU without shader-f16: same layout with fp32-activation variants (q4 / fp32 embed).
// CPU ("wasm" key): only used under Node/Bun, where native ONNX Runtime runs the q4 graphs (MatMulNBits +
// GatherBlockQuantized). Browsers can't: ONNX Runtime Web's WASM backend lacks GatherBlockQuantized, which every
// quantized variant uses — so in browsers these models require WebGPU (see the load handler).
//
// Original Chatterbox (onnx-community export): embed/encoder/decoder ship in fp32 only; only the 0.5B Llama
// language model has quantised variants. q4f16 LM + fp32 rest verified clean on WebGPU (≈1.5 GB total).
type DType = "fp32" | "fp16" | "q4" | "q4f16" | "q8";
type DTypeMap = Record<"embed_tokens" | "speech_encoder" | "language_model" | "conditional_decoder", DType>;
type Target = "webgpu-f16" | "webgpu" | "wasm";

/**
 * Sampling as in Resemble's reference `generate()` (tts_turbo.py / tts.py). Greedy decoding is deterministic, so a
 * voice + sentence that never emits stop-of-speech does so every time — the model then babbles until the token cap.
 * The original's classifier-free guidance (cfg_weight 0.5) needs a batch-2 unconditioned pass the ONNX export lacks.
 */
interface Sampling {
  temperature: number;
  /** 0 = no top-k limit */
  topK: number;
  topP: number;
  minP: number;
  repetitionPenalty: number;
}

const WINDOW_SHAPE = { context: 8, lookahead: 4, samplesPerToken: 960, fadeSamples: 480 } as const;
/**
 * Turbo's one-step decoder is cheap per call: stream 15 tokens (0.6 s) first for fast first audio, then 60 — smaller
 * windows lose more to per-call overhead (measured 14 ms/token at 40 vs 12.9 at 60).
 */
const STREAM_WINDOWS: StitchConfig = { first: 15, size: 60, ...WINDOW_SHAPE };
/**
 * The original's multi-step fp32 decoder has a large fixed cost per call: windowing raised its RTF from 1.38 to 2.05,
 * so it vocodes each sentence in one pass (a window that only closes at the end of the stream).
 */
const WHOLE_SENTENCE: StitchConfig = { first: Number.POSITIVE_INFINITY, size: Number.POSITIVE_INFINITY, ...WINDOW_SHAPE };

const RUNTIME: Record<TtsModelKey, { dtypes: Record<Target, DTypeMap>; sampling: Sampling; stream: StitchConfig }> = {
  "chatterbox-turbo": {
    sampling: { temperature: 0.8, topK: 1000, topP: 0.95, minP: 0, repetitionPenalty: 1.2 },
    stream: STREAM_WINDOWS,
    dtypes: {
      "webgpu-f16": { embed_tokens: "fp16", speech_encoder: "q4f16", language_model: "q4f16", conditional_decoder: "q4" },
      webgpu: { embed_tokens: "fp32", speech_encoder: "q4", language_model: "q4", conditional_decoder: "q4" },
      wasm: { embed_tokens: "q4", speech_encoder: "q4", language_model: "q4", conditional_decoder: "q4" },
    },
  },
  chatterbox: {
    sampling: { temperature: 0.8, topK: 0, topP: 1, minP: 0.05, repetitionPenalty: 1.2 },
    stream: WHOLE_SENTENCE,
    dtypes: {
      "webgpu-f16": { embed_tokens: "fp32", speech_encoder: "fp32", language_model: "q4f16", conditional_decoder: "fp32" },
      webgpu: { embed_tokens: "fp32", speech_encoder: "fp32", language_model: "q4", conditional_decoder: "fp32" },
      wasm: { embed_tokens: "fp32", speech_encoder: "fp32", language_model: "q4", conditional_decoder: "fp32" },
    },
  },
};

env.allowLocalModels = false; // never probe /models/* on the host's dev server

/* ------------------------------ state ------------------------------ */

interface Loaded {
  key: TtsModelKey;
  device: Device;
  model: ChatterboxModel;
  tokenizer: PreTrainedTokenizer;
}

let loaded: Loaded | null = null;
/** Runs before every language-model step; the streaming vocoder uses it to decode finished windows in between. */
let beforeStep: (() => Promise<void>) | null = null;
/** One GPU job at a time: a model switch never disposes a model mid-generation. */
const serial = createSerialQueue();

/* ------------------------------ loading ------------------------------ */

function progressTracker(key: TtsModelKey, broadcast: (b: TtsBroadcast) => void) {
  const files = new Map<string, { loaded: number; total: number }>();
  let last = 0;
  return (info: Record<string, unknown>) => {
    const file = typeof info.file === "string" ? info.file : "";
    if (!file) return;
    if (info.status === "progress" && typeof info.total === "number") {
      files.set(file, { loaded: Number(info.loaded ?? 0), total: info.total });
    } else if (info.status === "done") {
      const f = files.get(file);
      if (f) f.loaded = f.total;
    } else if (info.status === "initiate" && !files.has(file)) {
      files.set(file, { loaded: 0, total: 0 });
    } else return;
    let bytes = 0;
    let total = 0;
    for (const f of files.values()) {
      bytes += f.loaded;
      total += f.total;
    }
    const now = performance.now();
    if (info.status === "progress" && now - last < 100) return; // throttle UI updates
    last = now;
    // Reserve the final 5% for session creation / warm-up.
    const progress: LoadProgress = { progress: total ? (bytes / total) * 0.95 : 0, loaded: bytes, total, label: file };
    broadcast({ type: "progress", model: key, progress });
  };
}

async function loadModel(key: TtsModelKey, device: Device, dtype: DTypeMap, broadcast: (b: TtsBroadcast) => void): Promise<void> {
  const repo = TTS_MODELS[key].repo;
  const onProgress = progressTracker(key, broadcast);
  const [tokenizer, model] = await Promise.all([
    AutoTokenizer.from_pretrained(repo, { progress_callback: onProgress }),
    ChatterboxModel.from_pretrained(repo, { device: onnxDevice(device), dtype, progress_callback: onProgress }),
  ]).catch((e: unknown) => {
    throw new SpeechError("model-download-failed", `Could not download or open ${repo}: ${e instanceof Error ? e.message : String(e)}`, {
      cause: e,
    });
  });
  // Instance-level wrap: generate() awaits this.forward() once per token, which gives us a sequential slot to run
  // vocoder windows between LM steps without two GPU sessions competing.
  const forward = model.forward.bind(model);
  model.forward = async (inputs: Parameters<ChatterboxModel["forward"]>[0]) => {
    await beforeStep?.();
    return forward(inputs);
  };
  loaded = { key, device, model: model as ChatterboxModel, tokenizer };
}

async function warmUp(key: TtsModelKey, broadcast: (b: TtsBroadcast) => void): Promise<void> {
  // Tiny end-to-end run: compiles WebGPU shaders for all four sessions (prefill + decode paths),
  // so the user's first sentence doesn't pay that cost.
  broadcast({ type: "progress", model: key, progress: { progress: 0.97, label: "Warming up" } });
  const n = SAMPLE_RATE * 2;
  const ref = Float32Array.from(
    { length: n },
    (_, i) => 0.05 * Math.sin((2 * Math.PI * 140 * i) / SAMPLE_RATE) * (1 + 0.3 * Math.sin(i / 900)),
  );
  const speaker = deserialise(await encode(ref, SAMPLE_RATE));
  await synthStream("Hi.", speaker, () => undefined, { signal: new AbortController().signal, maxNewTokens: 12 });
}

async function disposeModel(): Promise<void> {
  const m = loaded?.model;
  loaded = null;
  await m?.dispose();
}

function require(): Loaded {
  if (!loaded) throw new SpeechError("model-not-loaded", "Load a text-to-speech model first.");
  return loaded;
}

/* ------------------------------ conditioning ------------------------------ */

type SpeakerTensors = Record<"audio_features" | "audio_tokens" | "speaker_embeddings" | "speaker_features", Tensor>;

async function encode(audio: Float32Array, sampleRate: number): Promise<SpeakerConditioning> {
  const { model, key } = require();
  let pcm = sampleRate === SAMPLE_RATE ? audio : resample(audio, sampleRate, SAMPLE_RATE);
  if (pcm.length > MAX_REF_SECONDS * SAMPLE_RATE) pcm = pcm.subarray(0, MAX_REF_SECONDS * SAMPLE_RATE);
  // Peak-normalise quiet recordings so the encoder sees a consistent level.
  const peak = pcm.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  if (peak > 1e-4 && (peak < 0.5 || peak > 1)) pcm = pcm.map((x) => x * (0.9 / peak));
  const out = (await model.encode_speech(new Tensor("float32", pcm, [1, pcm.length]))) as unknown as SpeakerTensors;
  const tensors: Record<string, { dims: number[]; type: string; data: ArrayBuffer }> = {};
  for (const [name, t] of Object.entries(out)) {
    const data = t.data as Float32Array | BigInt64Array;
    tensors[name] = {
      dims: [...t.dims],
      type: t.type,
      data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
    };
  }
  return { modelId: TTS_MODELS[key].repo, tensors };
}

const ARRAYS: Record<string, new (b: ArrayBuffer) => ArrayLike<unknown>> = {
  float32: Float32Array,
  int64: BigInt64Array,
  float16: Uint16Array,
  int32: Int32Array,
};

function deserialise(s: SpeakerConditioning): SpeakerTensors {
  const repo = TTS_MODELS[require().key].repo;
  if (s.modelId !== repo) throw new SpeechError("invalid-voice", `This voice was encoded for ${s.modelId}; re-encode it for ${repo}.`);
  const out: Partial<SpeakerTensors> = {};
  for (const key of ["audio_features", "audio_tokens", "speaker_embeddings", "speaker_features"] as const) {
    const t = s.tensors[key];
    if (!t) throw new SpeechError("invalid-voice", `Voice conditioning is missing "${key}".`);
    const Ctor = ARRAYS[t.type];
    if (!Ctor) throw new SpeechError("invalid-voice", `Unsupported tensor type ${t.type} in voice conditioning.`);
    // Tensor type names match ONNX's ('float32', 'int64', …)
    out[key] = new Tensor(t.type as "float32", new Ctor(t.data) as Float32Array, t.dims);
  }
  return out as SpeakerTensors;
}

/* ------------------------------ generation ------------------------------ */

/**
 * Repetition penalty over the *generated speech tokens only* (the prompt's text-token ids live in a different
 * vocabulary), then min-p / top-p. Runs after transformers.js' temperature warper; the penalty is multiplicative,
 * so the order matches the reference. top-k is applied by the multinomial sampler afterwards.
 */
class SpeechLogits extends LogitsProcessor {
  constructor(
    private promptLen: number,
    private s: Sampling,
  ) {
    super();
  }
  override _call(input_ids: bigint[][], logits: Tensor): Tensor {
    input_ids.forEach((ids, i) => {
      const row = (logits as unknown as Tensor[])[i];
      if (!row) return;
      const d = row.data as Float32Array;
      penalizeRepeats(d, ids.slice(this.promptLen), this.s.repetitionPenalty);
      filterMinP(d, this.s.minP);
      filterTopP(d, this.s.topP);
    });
    return logits;
  }
}

/** Stops on abort, or when the generated tail has collapsed into a loop (backstop to sampling + the token cap). */
class StopGuard extends StoppingCriteria {
  constructor(
    private promptLen: number,
    private signal: AbortSignal,
  ) {
    super();
  }
  // Typed number[][] by the base class; generate() actually passes bigint ids — isDegenerate handles either.
  override _call(input_ids: number[][]): boolean[] {
    return input_ids.map((ids) => this.signal.aborted || isDegenerate(ids.slice(this.promptLen)));
  }
}

/** Collects generated speech tokens as they are sampled (the first put() is the prompt). */
class TokenSink extends BaseStreamer {
  readonly tokens: bigint[] = [];
  private seenPrompt = false;
  override put(value: bigint[][]): void {
    if (!this.seenPrompt) {
      this.seenPrompt = true;
      return;
    }
    const t = value[0]?.[0];
    if (t !== undefined && t < SPEECH_VOCAB) this.tokens.push(t);
  }
  override end(): void {}
}

/** The LM-only generate() — ChatterboxModel.generate would also run one vocoder pass over the whole sentence. */
const generateTokens = PreTrainedModel.prototype.generate;

interface VocoderPrompt {
  tokens: BigInt64Array;
  features: Tensor;
}

function vocoderPrompt(s: SpeakerTensors): VocoderPrompt {
  const k = Math.min(VOCODER_PROMPT_TOKENS, s.audio_tokens.dims[1] ?? 0, Math.floor((s.speaker_features.dims[1] ?? 0) / 2));
  return { tokens: (s.audio_tokens.data as BigInt64Array).slice(0, k), features: s.speaker_features.slice(null, [0, 2 * k], null) };
}

async function vocode(
  model: ChatterboxModel,
  prompt: VocoderPrompt,
  speaker: SpeakerTensors,
  tokens: bigint[],
  final: boolean,
): Promise<Float32Array> {
  // The final window gets the 3 trailing silence tokens ChatterboxModel.generate appends, for a clean ending.
  const ids = BigInt64Array.from([...prompt.tokens, ...tokens, ...(final ? [SILENCE_TOKEN, SILENCE_TOKEN, SILENCE_TOKEN] : [])]);
  const session = (
    model as unknown as { sessions: Record<string, { run(feeds: Record<string, unknown>): Promise<Record<string, { data: unknown }>> }> }
  ).sessions.conditional_decoder;
  if (!session) throw new SpeechError("model-init-failed", "The model has no conditional_decoder session.");
  const feed = (t: Tensor) => (t as unknown as { ort_tensor: unknown }).ort_tensor;
  const out = await session.run({
    speech_tokens: feed(new Tensor("int64", ids, [1, ids.length])),
    speaker_embeddings: feed(speaker.speaker_embeddings),
    speaker_features: feed(prompt.features),
  });
  const waveform = out.waveform?.data;
  if (!(waveform instanceof Float32Array)) throw new SpeechError("generation-failed", "The vocoder returned no waveform.");
  return waveform.slice();
}

/** Generates one chunk of text, calling onAudio with each stitched window as soon as it is decoded. */
async function synthStream(
  text: string,
  speaker: SpeakerTensors,
  onAudio: (pcm: Float32Array) => void,
  opts: { signal: AbortSignal; maxNewTokens?: number; exaggeration?: number | undefined },
): Promise<void> {
  const { model, tokenizer, key } = require();
  const { sampling, stream } = RUNTIME[key];
  const normalized = normalizeText(text);
  const inputs = tokenizer(normalized) as { input_ids: Tensor; attention_mask: Tensor };
  const promptLen = inputs.input_ids.dims[1] ?? 0;
  const sink = new TokenSink();
  const prompt = vocoderPrompt(speaker);
  let state = initialStitchState;
  const drain = async (final: boolean) => {
    for (let w = nextWindow(stream, state, sink.tokens.length, final); w; w = nextWindow(stream, state, sink.tokens.length, final)) {
      const audio = await vocode(model, prompt, speaker, sink.tokens.slice(w.from, w.to), w.final);
      const r = stitch(stream, state, w, audio);
      state = r.state;
      onAudio(r.out);
    }
  };
  beforeStep = () => drain(false);
  try {
    await generateTokens.call(model, {
      ...inputs,
      ...speaker,
      // Turbo's embed_tokens has no `exaggeration` input; forward() only forwards it when the graph has one.
      ...(opts.exaggeration !== undefined ? { exaggeration: opts.exaggeration } : {}),
      max_new_tokens: opts.maxNewTokens ?? maxNewTokens(normalized.length),
      do_sample: true,
      temperature: sampling.temperature,
      top_k: sampling.topK,
      repetition_penalty: 1.0, // the built-in one would also penalise prompt text ids; SpeechLogits does it instead
      logits_processor: [new SpeechLogits(promptLen, sampling)],
      stopping_criteria: [new StopGuard(promptLen, opts.signal)],
      streamer: sink,
    } as unknown as Parameters<PreTrainedModel["generate"]>[0]);
  } finally {
    beforeStep = null;
  }
  if (!opts.signal.aborted) await drain(true);
}

/* ------------------------------ handlers ------------------------------ */

const { broadcast } = exposeRpc<TtsProtocol, TtsBroadcast>({
  load: ({ model: key, device: preferred, transformers }) =>
    serial(async () => {
      if (loaded?.key === key) return { device: loaded.device };
      if (transformers.remoteHost) env.remoteHost = transformers.remoteHost;
      if (transformers.useBrowserCache !== undefined) env.useBrowserCache = transformers.useBrowserCache;
      const wasm = env.backends.onnx.wasm;
      if (transformers.wasmPaths && wasm) wasm.wasmPaths = transformers.wasmPaths;
      await disposeModel(); // only one model fits comfortably in GPU memory
      broadcast({ type: "progress", model: key, progress: { progress: 0, label: "Checking device" } });
      const pick = await probeDevice(preferred);
      const { dtypes } = RUNTIME[key];
      if (pick.device === "webgpu") {
        await loadModel(key, "webgpu", pick.shaderF16 ? dtypes["webgpu-f16"] : dtypes.webgpu, broadcast);
        await warmUp(key, broadcast);
        return { device: "webgpu" as const };
      }
      // Every quantized variant of these graphs (q4, q4f16 and int8) uses GatherBlockQuantized, which ONNX Runtime
      // Web's WASM backend doesn't implement, so browsers need WebGPU. Native ONNX Runtime (Node/Bun) has the op, so the
      // CPU path stays available there (tests, scripts).
      if (onnxDevice("wasm") === "wasm") {
        throw new SpeechError(
          "webgpu-required",
          `${TTS_MODELS[key].label} needs WebGPU in the browser (its quantized models use an operator the WASM backend lacks). Try a recent Chrome, Edge or Safari.`,
        );
      }
      await loadModel(key, "wasm", dtypes.wasm, broadcast);
      return { device: "wasm" as const };
    }),

  encode: ({ pcm, sampleRate }) => serial(() => encode(pcm, sampleRate)),

  generate: ({ text, conditioning, exaggeration }, { signal, emit }) =>
    serial(async () => {
      const speaker = deserialise(conditioning);
      const sentences = splitText(text);
      const t0 = performance.now();
      let samples = 0;
      for (const [index, sentence] of sentences.entries()) {
        if (signal.aborted) break;
        let last = performance.now();
        const piece = (pcm: Float32Array, final: boolean) => {
          const now = performance.now();
          samples += pcm.length;
          emit({ sentence: { index, count: sentences.length, text: sentence }, pcm, genMs: now - last, final }, [pcm.buffer]);
          last = now;
        };
        await synthStream(sentence, speaker, (pcm) => piece(pcm, false), { signal, exaggeration });
        piece(new Float32Array(0), true); // sentence boundary marker for karaoke + buffering stats
      }
      signal.throwIfAborted();
      return { audioSeconds: samples / SAMPLE_RATE, totalMs: performance.now() - t0 };
    }),

  unload: () =>
    serial(async () => {
      await disposeModel();
      return undefined;
    }),
});
