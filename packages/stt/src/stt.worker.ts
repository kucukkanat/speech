/// <reference lib="webworker" />
// Speech-to-text worker: Voxtral Realtime (native streaming, WebGPU) | Moonshine base (energy VAD + rolling
// re-decode). Audio arrives as transferred 16 kHz mono frames through `push`; one session at a time.
import {
  BaseStreamer,
  env,
  type ProgressInfo,
  pipeline,
  VoxtralRealtimeForConditionalGeneration,
  VoxtralRealtimeProcessor,
} from "@huggingface/transformers";
import { createSerialQueue, type Device, type Exposed, exposeRpc, onnxDevice, probeDevice, SpeechError } from "@kucukkanat/speech-core";
import { MoonshineStreamer } from "./internal/moonshine.js";
import { createPcmQueue, SAMPLE_RATE } from "./internal/pcm-queue.js";
import type { StreamUpdate } from "./internal/text.js";
import { runVoxtralStream, VOXTRAL_FLUSH_SAMPLES, type VoxtralProcessor } from "./internal/voxtral.js";
import { STT_MODELS, type SttModelKey } from "./models.js";
import type { SttBroadcast, SttProtocol } from "./protocol.js";

env.allowLocalModels = false; // never probe /models/* on the host's dev server

type Loaded =
  | { key: "voxtral-realtime"; device: Device; model: VoxtralRealtimeForConditionalGeneration; processor: VoxtralRealtimeProcessor }
  | { key: "moonshine-base"; device: Device; transcribe: (a: Float32Array) => Promise<string>; dispose: () => Promise<unknown> };

interface Session {
  push(pcm: Float32Array): void;
  finish(): Promise<StreamUpdate>;
}

let loaded: Loaded | null = null;
let session: Session | null = null;
/** Model loads/unloads one at a time; audio frames bypass this so they are never delayed. */
const serial = createSerialQueue();

/* ------------------------------ loading ------------------------------ */

function progressTracker(key: SttModelKey, expectedBytes: number, broadcast: (b: SttBroadcast) => void) {
  const files = new Map<string, { loaded: number; total: number }>();
  let last = 0;
  return (p: ProgressInfo) => {
    if (p.status !== "progress") return;
    files.set(p.file, { loaded: p.loaded, total: p.total });
    const now = performance.now();
    if (now - last < 100 && p.loaded < p.total) return; // throttle UI updates
    last = now;
    let bytes = 0;
    let total = 0;
    for (const f of files.values()) {
      bytes += f.loaded;
      total += f.total;
    }
    // Not every file has announced its size yet: use the known expected total as a floor.
    total = Math.max(total, expectedBytes);
    broadcast({
      type: "progress",
      model: key,
      progress: { progress: Math.min(1, bytes / total), loaded: bytes, total, label: p.file.split("/").pop() ?? p.file },
    });
  };
}

async function loadVoxtral(preferred: Device | "auto", broadcast: (b: SttBroadcast) => void): Promise<Loaded> {
  const gpu = await probeDevice(preferred);
  if (gpu.device !== "webgpu")
    throw new SpeechError("webgpu-required", "Voxtral Realtime needs WebGPU, which isn't available here. Use Moonshine instead.");
  const repo = STT_MODELS["voxtral-realtime"].repo;
  // q4f16 (≈2.83 GB) as in mistralai/Voxtral-Realtime-WebGPU; q4 (≈3.18 GB) when the GPU lacks shader-f16.
  const dt = gpu.shaderF16 ? "q4f16" : "q4";
  const expected = gpu.shaderF16 ? (585.8 + 232.8 + 2016.3) * 1e6 : (661.1 + 257.9 + 2264.6) * 1e6;
  const model = (await VoxtralRealtimeForConditionalGeneration.from_pretrained(repo, {
    device: "webgpu",
    dtype: { audio_encoder: dt, embed_tokens: dt, decoder_model_merged: dt },
    progress_callback: progressTracker("voxtral-realtime", expected, broadcast),
  })) as VoxtralRealtimeForConditionalGeneration;
  broadcast({ type: "progress", model: "voxtral-realtime", progress: { progress: 1, label: "Loading processor" } });
  const processor = (await VoxtralRealtimeProcessor.from_pretrained(repo)) as VoxtralRealtimeProcessor;
  return { key: "voxtral-realtime", device: "webgpu", model, processor };
}

async function loadMoonshine(preferred: Device | "auto", broadcast: (b: SttBroadcast) => void): Promise<Loaded> {
  const { device } = await probeDevice(preferred);
  const repo = STT_MODELS["moonshine-base"].repo;
  // Same split as Xenova's moonshine-web on WebGPU (fp32 encoder + q4 decoder, ≈158 MB); on WASM, q8 encoder +
  // decoder (≈67 MB), verified accurate by the model integration test.
  const dtype =
    device === "webgpu" ? { encoder_model: "fp32", decoder_model_merged: "q4" } : { encoder_model: "q8", decoder_model_merged: "q8" };
  const expected = (device === "webgpu" ? 80.8 + 72.8 : 20.5 + 42.5) * 1e6;
  const asr = await pipeline("automatic-speech-recognition", repo, {
    device: onnxDevice(device),
    dtype: dtype as never,
    progress_callback: progressTracker("moonshine-base", expected, broadcast),
  });
  const transcribe = async (audio: Float32Array) => {
    // The pipeline's default is floor(seconds)*6 tokens → 0 for sub-second partials; give a little headroom.
    const max_new_tokens = Math.max(8, Math.ceil((audio.length / SAMPLE_RATE) * 6) + 4);
    const out = (await asr(audio, { max_new_tokens } as never)) as { text: string } | { text: string }[];
    return Array.isArray(out) ? (out[0]?.text ?? "") : out.text;
  };
  broadcast({
    type: "progress",
    model: "moonshine-base",
    progress: { progress: 1, label: device === "webgpu" ? "Compiling shaders" : "Warming up" },
  });
  await transcribe(new Float32Array(SAMPLE_RATE)); // compile shaders / warm up
  return { key: "moonshine-base", device, transcribe, dispose: () => asr.dispose() };
}

async function disposeLoaded(): Promise<void> {
  const c = loaded;
  loaded = null;
  session = null;
  if (c?.key === "voxtral-realtime") await c.model.dispose();
  else await c?.dispose();
}

/* ------------------------------ sessions ------------------------------ */

function startSession(live: boolean, onUpdate: (u: StreamUpdate) => void, onError: (e: unknown) => void): Session {
  const c = loaded;
  if (!c) throw new SpeechError("model-not-loaded", "Load a speech-to-text model first.");
  if (c.key === "moonshine-base") {
    // Files are fed faster than real time: skip live partials there, only finished utterances matter.
    const s = new MoonshineStreamer({
      transcribe: c.transcribe,
      onUpdate,
      onError,
      partialIntervalMs: live ? 350 : Number.POSITIVE_INFINITY,
    });
    return { push: (p) => s.push(p), finish: () => s.flush() };
  }
  // Voxtral: frames go into a queue that the generation loop pulls from as fast as it can.
  const queue = createPcmQueue();
  const run = runVoxtralStream({
    model: c.model as unknown as { generate(args: Record<string, unknown>): Promise<unknown> },
    processor: c.processor as unknown as VoxtralProcessor,
    BaseStreamer: BaseStreamer as unknown as new () => { put(value: bigint[][]): void; end(): void },
    queue,
    onUpdate,
  });
  run.catch(onError);
  return {
    push: (p) => queue.push(p),
    finish: async () => {
      // Append silence ≥ the model's 480 ms delay so the last words are emitted, then drain.
      queue.push(new Float32Array(VOXTRAL_FLUSH_SAMPLES));
      queue.close();
      return run;
    },
  };
}

/* ------------------------------ handlers ------------------------------ */

let ending: (() => void) | null = null;

// Annotated: the handlers call broadcast(), which TypeScript can't infer through its own initializer.
const exposed: Exposed<SttBroadcast> = exposeRpc<SttProtocol, SttBroadcast>({
  load: ({ model: key, device, transformers }) =>
    serial(async () => {
      if (loaded?.key === key) return { device: loaded.device };
      if (transformers.remoteHost) env.remoteHost = transformers.remoteHost;
      if (transformers.useBrowserCache !== undefined) env.useBrowserCache = transformers.useBrowserCache;
      const wasm = env.backends.onnx.wasm;
      if (transformers.wasmPaths && wasm) wasm.wasmPaths = transformers.wasmPaths;
      await disposeLoaded();
      exposed.broadcast({ type: "progress", model: key, progress: { progress: 0, label: "Preparing download" } });
      const broadcast = (b: SttBroadcast) => exposed.broadcast(b);
      loaded = await (key === "voxtral-realtime" ? loadVoxtral(device, broadcast) : loadMoonshine(device, broadcast)).catch(
        (e: unknown) => {
          if (e instanceof SpeechError) throw e;
          throw new SpeechError(
            "model-download-failed",
            `Could not download or open ${STT_MODELS[key].repo}: ${e instanceof Error ? e.message : String(e)}`,
            {
              cause: e,
            },
          );
        },
      );
      return { device: loaded.device };
    }),

  open: ({ live }, { signal, emit }) =>
    new Promise<StreamUpdate>((resolve, reject) => {
      if (session) throw new SpeechError("busy", "A transcription is already running; stop it first.");
      const fail = (e: unknown) => {
        session = null;
        ending = null;
        reject(
          e instanceof SpeechError
            ? e
            : new SpeechError("internal", `Transcription failed: ${e instanceof Error ? e.message : String(e)}`, { cause: e }),
        );
      };
      const s = startSession(live, emit, fail);
      session = s;
      signal.addEventListener("abort", () => {
        if (session === s) session = null;
        ending = null;
        reject(signal.reason);
      });
      ending = () => {
        if (session === s) session = null;
        ending = null;
        s.finish().then(resolve, fail);
      };
    }),

  push: async ({ pcm }) => {
    session?.push(pcm);
    return undefined;
  },

  end: async () => {
    ending?.();
    return undefined;
  },

  unload: () =>
    serial(async () => {
      await disposeLoaded();
      return undefined;
    }),
});
