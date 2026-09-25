// Voxtral Realtime streaming. Needs the 2.85 GB WebGPU-only model, so it is exercised by the local E2E run
// (E2E_VOXTRAL=1), not by unit tests. Structural types keep this module free of @huggingface/transformers.
import { FRAME_SAMPLES, type PcmQueue } from "./pcm-queue.js";
import { joinText, type StreamUpdate } from "./text.js";

interface Features {
  dims: number[];
}

/** The parts of transformers.js' VoxtralRealtimeProcessor this loop uses. */
export interface VoxtralProcessor {
  (
    audio: Float32Array,
    options: { is_streaming: boolean; is_first_audio_chunk: boolean },
  ): Promise<{ input_features: Features; input_ids?: unknown }>;
  feature_extractor: { config: { hop_length: number; n_fft: number } };
  audio_length_per_tok: number;
  num_samples_first_audio_chunk: number;
  num_samples_per_audio_chunk: number;
  num_mel_frames_first_audio_chunk: number;
  tokenizer: { all_special_ids: number[]; decode(ids: bigint[], options: { skip_special_tokens: boolean }): string };
}

export interface VoxtralStreamOptions {
  model: { generate(args: Record<string, unknown>): Promise<unknown> };
  processor: VoxtralProcessor;
  /** `BaseStreamer` class from @huggingface/transformers */
  BaseStreamer: new () => { put(value: bigint[][]): void; end(): void };
  queue: PcmQueue;
  onUpdate: (update: StreamUpdate) => void;
  /** Restart generation after this many tokens (80 ms each) to bound decoder/encoder KV-cache growth. */
  maxTokensPerSegment?: number;
}

/** Delay tokens (480 ms) + margin of silence appended on stop so the final words are emitted. */
export const VOXTRAL_FLUSH_SAMPLES: number = (6 + 4) * FRAME_SAMPLES;

/**
 * Runs Voxtral Realtime over a live PCM queue until the queue is closed and drained. Mirrors
 * mistralai/Voxtral-Realtime-WebGPU: the first chunk goes through processor(…, {is_first_audio_chunk: true}), then an
 * async generator yields mel chunks of (8 frames = 1 token) + n_fft context; when the model has fallen behind, all
 * audio that is already available is batched into one chunk (feed as fast as possible).
 */
export async function runVoxtralStream(o: VoxtralStreamOptions): Promise<StreamUpdate> {
  const { processor, queue } = o;
  const { hop_length, n_fft } = processor.feature_extractor.config;
  const winHalf = Math.floor(n_fft / 2);
  const samplesPerTok = processor.audio_length_per_tok * hop_length;
  const firstSamples = processor.num_samples_first_audio_chunk;
  const chunkSamples = processor.num_samples_per_audio_chunk;
  const tokenizer = processor.tokenizer;
  const specialIds = new Set(tokenizer.all_special_ids.map((x) => BigInt(x)));
  const maxTokens = o.maxTokensPerSegment ?? 3750; // ≈ 5 min per segment

  let doneText = ""; // text of finished segments
  let segText = "";
  const emit = () => {
    const full = joinText(doneText, segText);
    // Voxtral tokens are final once emitted; only the word still being spelled is shown as partial.
    const cut = full.search(/\s\S*$/);
    if (cut < 0) o.onUpdate({ committed: "", partial: full });
    else o.onUpdate({ committed: full.slice(0, cut + 1), partial: full.slice(cut + 1) });
  };

  let segStart = 0; // absolute sample index where the current segment begins

  while (true) {
    await queue.waitFor(segStart + firstSamples);
    if (queue.length - segStart <= 0 && queue.closed) break;

    const first = await processor(queue.slice(segStart, segStart + firstSamples), { is_streaming: true, is_first_audio_chunk: true });
    let melFrameIdx = processor.num_mel_frames_first_audio_chunk;
    let nextStart = segStart + melFrameIdx * hop_length - winHalf;

    async function* features() {
      yield first.input_features;
      while (true) {
        const startIdx = nextStart;
        const endNeeded = startIdx + chunkSamples;
        await queue.waitFor(endNeeded);
        const available = queue.length;
        // Queue closed short of a full chunk: pad the tail (it already contains flush silence) once, then finish.
        if (available < endNeeded && available <= startIdx + winHalf) return;
        let batchEnd = endNeeded;
        while (batchEnd + samplesPerTok <= available) batchEnd += samplesPerTok;
        const inp = await processor(queue.slice(startIdx, batchEnd), { is_streaming: true, is_first_audio_chunk: false });
        yield inp.input_features;
        melFrameIdx += inp.input_features.dims[2] ?? 0;
        nextStart = segStart + melFrameIdx * hop_length - winHalf;
        queue.trimBefore(nextStart - n_fft);
        if (available < endNeeded) return;
      }
    }

    let cache: bigint[] = [];
    let isPrompt = true;
    const streamer = new (class extends o.BaseStreamer {
      override put(value: bigint[][]) {
        if (isPrompt) {
          isPrompt = false;
          return;
        }
        const toks = value[0] ?? [];
        const only = toks[0];
        if (toks.length === 1 && only !== undefined && specialIds.has(only)) return;
        cache = cache.concat(toks);
        segText = tokenizer.decode(cache, { skip_special_tokens: true });
        emit();
      }
      override end() {}
    })();

    segText = "";
    await o.model.generate({ input_ids: first.input_ids, input_features: features(), max_new_tokens: maxTokens, streamer });
    doneText = joinText(doneText, segText);
    segText = "";
    if (queue.closed) break;
    // max_new_tokens reached while still listening → start a fresh segment where the encoder left off
    segStart = Math.max(0, nextStart);
  }
  const final = { committed: doneText, partial: "" };
  o.onUpdate(final);
  return final;
}
