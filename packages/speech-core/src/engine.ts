// The model lifecycle shared by the TTS and STT engines: status store, deduplicated loading with progress, model
// switching and crash reporting. Engines plug in how to load a model; everything else behaves identically.
import { SpeechError } from "./errors.js";
import { createStore, type Store } from "./store.js";
import type { Device, EngineStatus, LoadProgress } from "./types.js";

export interface LoadOptions {
  /** Stops *waiting* for the load (the download continues for other callers); rejects with the signal's reason. */
  signal?: AbortSignal;
  onProgress?: (progress: LoadProgress) => void;
}

export interface EngineCore<M extends string> {
  readonly status: Store<EngineStatus<M>>;
  /** The model the next load targets. */
  readonly selected: M;
  select(model: M): void;
  /** Loads the selected model (a no-op when it's ready; concurrent callers share one load). */
  load(options?: LoadOptions): Promise<void>;
  /** Forget the loaded model (after an unload); status returns to idle. */
  reset(): void;
}

export interface EngineCoreOptions<M extends string> {
  model: M;
  loadModel: (model: M) => Promise<{ device: Device }>;
  /** Subscribe to progress reported while `loadModel` runs. */
  onProgress: (listener: (model: M, progress: LoadProgress) => void) => void;
  /** Subscribe to the worker dying (status becomes an error; the next load starts over). */
  onCrash: (listener: (error: SpeechError) => void) => void;
}

export function createEngineCore<M extends string>(options: EngineCoreOptions<M>): EngineCore<M> {
  let selected = options.model;
  const status = createStore<EngineStatus<M>>({ state: "idle" });
  const progressListeners = new Set<(p: LoadProgress) => void>();
  let loading: { model: M; promise: Promise<void> } | null = null;

  options.onProgress((model, progress) => {
    const s = status.get();
    if (s.state !== "loading" || s.model !== model) return;
    status.set({ state: "loading", model, progress });
    for (const l of progressListeners) l(progress);
  });
  options.onCrash((error) => {
    loading = null;
    status.set({ state: "error", model: selected, error });
  });

  const start = (model: M): Promise<void> => {
    status.set({ state: "loading", model, progress: { progress: 0, label: "Starting" } });
    const promise = options.loadModel(model).then(
      ({ device }) => {
        if (selected === model) status.set({ state: "ready", model, device });
      },
      (e: unknown) => {
        const error =
          e instanceof SpeechError ? e : new SpeechError("model-init-failed", `Could not load ${model}: ${String(e)}`, { cause: e });
        if (selected === model) status.set({ state: "error", model, error });
        throw error;
      },
    );
    loading = { model, promise };
    // Clear the in-flight marker either way. Handling both outcomes here also keeps a failed load from surfacing as
    // an unhandled rejection when no caller is waiting anymore (callers still get the rejection).
    const clear = () => {
      if (loading?.promise === promise) loading = null;
    };
    promise.then(clear, clear);
    return promise;
  };

  return {
    status,
    get selected() {
      return selected;
    },
    select: (model) => {
      selected = model;
    },
    reset: () => {
      loading = null;
      status.set({ state: "idle" });
    },
    load: ({ signal, onProgress } = {}) => {
      const s = status.get();
      if (s.state === "ready" && s.model === selected) return Promise.resolve();
      const pending = loading?.model === selected ? loading.promise : start(selected);
      if (!onProgress && !signal) return pending;
      if (onProgress) progressListeners.add(onProgress);
      const cancelled = new Promise<never>((_, reject) => {
        if (!signal) return;
        if (signal.aborted) reject(signal.reason);
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
      return Promise.race([pending, cancelled]).finally(() => {
        if (onProgress) progressListeners.delete(onProgress);
      });
    },
  };
}
