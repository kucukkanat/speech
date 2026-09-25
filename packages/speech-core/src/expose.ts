// Worker side of ./rpc.ts. Runs inside worker threads, which Bun's coverage does not instrument; it is exercised by the
// real-worker integration tests in test/rpc.test.ts (via test/fixtures/echo.worker.ts).

import { SpeechError, serializeError } from "./errors.js";
import { type FromWorker, PING, type Protocol, type ToWorker } from "./rpc.js";

/** Wrap a handler result to move (not copy) buffers back to the main thread. */
export class Transfer<T> {
  constructor(
    readonly value: T,
    readonly transfer: Transferable[],
  ) {}
}

export interface CallContext<E> {
  /** Aborted when the caller cancels (their AbortSignal, a `break` out of an iterator, or `stop()`). */
  signal: AbortSignal;
  emit(event: E, transfer?: Transferable[]): void;
}

export type Handlers<P extends Protocol<P>> = {
  [K in keyof P]: (arg: P[K]["arg"], ctx: CallContext<P[K]["event"]>) => Promise<P[K]["result"] | Transfer<P[K]["result"]>>;
};

export interface Exposed<B> {
  /** Sends a worker-wide event (e.g. load progress) to every `onBroadcast` listener. */
  broadcast(event: B): void;
}

/** Serves `handlers` from inside a worker. Each call gets its own AbortSignal; errors keep their SpeechError code. */
export function exposeRpc<P extends Protocol<P>, B = never>(handlers: Handlers<P>): Exposed<B> {
  const scope = globalThis as unknown as DedicatedWorkerGlobalScope;
  const post = (msg: FromWorker, transfer: Transferable[] = []) => scope.postMessage(msg, transfer);
  const running = new Map<number, AbortController>();
  const table = handlers as unknown as Record<string, (arg: unknown, ctx: CallContext<unknown>) => Promise<unknown>>;

  scope.addEventListener("message", async (e: MessageEvent<ToWorker>) => {
    const msg = e.data;
    if (msg.t === "cancel") {
      running.get(msg.id)?.abort(new DOMException("The operation was aborted.", "AbortError"));
      return;
    }
    const { id, method, arg } = msg;
    if (method === PING) return post({ t: "result", id, value: undefined });
    const handler = table[method];
    if (!handler) return post({ t: "error", id, error: serializeError(new SpeechError("internal", `Unknown worker method "${method}"`)) });
    const controller = new AbortController();
    running.set(id, controller);
    try {
      const out = await handler(arg, { signal: controller.signal, emit: (event, transfer) => post({ t: "event", id, event }, transfer) });
      if (out instanceof Transfer) post({ t: "result", id, value: out.value }, out.transfer);
      else post({ t: "result", id, value: out });
    } catch (err) {
      post({ t: "error", id, error: serializeError(err) });
    } finally {
      running.delete(id);
    }
  });

  return { broadcast: (event) => post({ t: "broadcast", event }) };
}
