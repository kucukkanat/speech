// Typed request/response RPC over a Web Worker, with per-call event streams, cancellation and crash recovery.
//
//   main thread                                  worker
//   client.call("speak", arg, {signal, onEvent})  ──call──►  handlers.speak(arg, {signal, emit})
//                                     onEvent ◄──event──  emit(chunk)                (0..n times)
//                                     resolve ◄──result─  return value                (or error)
//   signal.abort()                          ──cancel──►  ctx.signal aborts
//   client.onBroadcast(cb)                  ◄─broadcast─  broadcast(status)            (worker-wide)

import { deserializeError, type SerializedError, SpeechError } from "./errors.js";

/** Shape of one method: its argument, result, and the events it may stream while running. */
export interface MethodShape {
  arg: unknown;
  result: unknown;
  event: unknown;
}

/** A protocol maps method names to shapes: `{ speak: { arg: SpeakArg; result: Stats; event: Chunk } }`. */
export type Protocol<P> = { [K in keyof P]: MethodShape };

export type ToWorker = { t: "call"; id: number; method: string; arg: unknown } | { t: "cancel"; id: number };
export type FromWorker =
  | { t: "result"; id: number; value: unknown }
  | { t: "error"; id: number; error: SerializedError }
  | { t: "event"; id: number; event: unknown }
  | { t: "broadcast"; event: unknown };

export const PING = "__ping";

/* ---------------------------------- client ---------------------------------- */

export interface CallOptions<E> {
  signal?: AbortSignal | undefined;
  /** Buffers to move (not copy) to the worker. The caller must not touch them afterwards. */
  transfer?: Transferable[];
  onEvent?: (event: E) => void;
}

export interface RpcClient<P extends Protocol<P>, B> {
  call<K extends keyof P & string>(method: K, arg: P[K]["arg"], options?: CallOptions<P[K]["event"]>): Promise<P[K]["result"]>;
  /** Resolves once the worker is up and answering — a cheap health check. */
  ping(): Promise<void>;
  onBroadcast(listener: (event: B) => void): () => void;
  /** Called when the worker dies; pending calls have already been rejected with `worker-crashed`. */
  onCrash(listener: (error: SpeechError<"worker-crashed">) => void): () => void;
  /** Terminates the worker. Later calls reject with `disposed`. */
  dispose(): void;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  onEvent: ((event: unknown) => void) | undefined;
}

/**
 * Creates a lazy client: the worker is spawned on the first call, and respawned on the next call after a crash.
 * `spawn` must contain the literal `new Worker(new URL("./x.worker.js", import.meta.url), { type: "module" })` in the
 * package that owns the worker, so bundlers can detect and bundle it.
 */
export function createRpcClient<P extends Protocol<P>, B = never>(spawn: () => Worker): RpcClient<P, B> {
  let worker: Worker | null = null;
  let disposed = false;
  let nextId = 1;
  const pending = new Map<number, Pending>();
  const broadcastListeners = new Set<(event: B) => void>();
  const crashListeners = new Set<(error: SpeechError<"worker-crashed">) => void>();

  const crash = (message: string) => {
    const error = new SpeechError("worker-crashed", `The speech worker stopped unexpectedly: ${message}`);
    worker?.terminate();
    worker = null;
    for (const p of pending.values()) p.reject(error);
    pending.clear();
    for (const l of crashListeners) l(error);
  };

  const onMessage = (e: MessageEvent<FromWorker>) => {
    const msg = e.data;
    if (msg.t === "broadcast") {
      for (const l of broadcastListeners) l(msg.event as B);
      return;
    }
    const p = pending.get(msg.id);
    if (!p) return; // cancelled: late messages for it are expected and dropped
    if (msg.t === "event") p.onEvent?.(msg.event);
    else {
      pending.delete(msg.id);
      if (msg.t === "result") p.resolve(msg.value);
      else p.reject(deserializeError(msg.error));
    }
  };

  const ensureWorker = (): Worker => {
    if (disposed) throw new SpeechError("disposed", "This engine was disposed; create a new one.");
    if (worker) return worker;
    const w = spawn();
    w.addEventListener("message", onMessage);
    w.addEventListener("error", (e) => {
      e.preventDefault();
      crash(e.message || "uncaught error in worker");
    });
    // No "messageerror" handler: the protocol only carries structured-clonable data and transferred ArrayBuffers
    // within one agent cluster, which cannot fail to deserialise.
    worker = w;
    return w;
  };

  const call = (method: string, arg: unknown, options: CallOptions<unknown> = {}): Promise<unknown> => {
    const { signal, transfer = [], onEvent } = options;
    if (signal?.aborted) return Promise.reject(signal.reason);
    let w: Worker;
    try {
      w = ensureWorker();
    } catch (e) {
      return Promise.reject(e);
    }
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        pending.delete(id);
        worker?.postMessage({ t: "cancel", id } satisfies ToWorker);
        reject(signal?.reason);
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      const settle =
        <T>(fn: (v: T) => void) =>
        (v: T) => {
          signal?.removeEventListener("abort", onAbort);
          fn(v);
        };
      pending.set(id, { resolve: settle(resolve), reject: settle(reject), onEvent });
      w.postMessage({ t: "call", id, method, arg } satisfies ToWorker, transfer);
    });
  };

  return {
    call: (method, arg, options) => call(method, arg, options as CallOptions<unknown>) as never,
    ping: () => call(PING, undefined).then(() => undefined),
    onBroadcast: (listener) => {
      broadcastListeners.add(listener);
      return () => broadcastListeners.delete(listener);
    },
    onCrash: (listener) => {
      crashListeners.add(listener);
      return () => crashListeners.delete(listener);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      worker?.terminate();
      worker = null;
      const error = new SpeechError("disposed", "This engine was disposed; create a new one.");
      for (const p of pending.values()) p.reject(error);
      pending.clear();
    },
  };
}
