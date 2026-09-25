/// <reference lib="webworker" />
// Test worker: exercises every RPC path with real messages (results, events, transfer, errors, cancellation, crashes).
import { exposeRpc, SpeechError, Transfer } from "../../src/index.js";

export interface EchoProtocol {
  echo: { arg: string; result: string; event: never };
  count: { arg: number; result: number; event: number };
  double: { arg: Float32Array; result: Float32Array; event: never };
  fail: { arg: "speech" | "plain" | "abort" | "string"; result: never; event: never };
  wait: { arg: number; result: "finished"; event: never };
  crash: { arg: undefined; result: never; event: never };
  announce: { arg: string; result: undefined; event: never };
}

const { broadcast } = exposeRpc<EchoProtocol, string>({
  echo: async (text) => text,
  count: async (n, { emit }) => {
    for (let i = 1; i <= n; i++) emit(i);
    return n;
  },
  double: async (pcm) => {
    const out = pcm.map((x) => x * 2);
    return new Transfer(out, [out.buffer]);
  },
  fail: async (kind) => {
    if (kind === "speech") throw new SpeechError("empty-text", "Nothing to say.");
    if (kind === "abort") throw new DOMException("stopped", "AbortError");
    if (kind === "string") throw "a bare string";
    throw new TypeError("boom");
  },
  wait: (ms, { signal }) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => resolve("finished"), ms);
      signal.addEventListener("abort", () => {
        clearTimeout(t);
        reject(signal.reason);
      });
    }),
  crash: async () => {
    setTimeout(() => {
      throw new Error("worker exploded");
    });
    return new Promise<never>(() => undefined);
  },
  announce: async (text) => {
    broadcast(text);
    return undefined;
  },
});
