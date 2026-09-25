import { describe, expect, test } from "bun:test";
import {
  createChannel,
  createEmitter,
  createSerialQueue,
  createStore,
  deserializeError,
  detectCapabilities,
  isAbortError,
  isSpeechError,
  probeDevice,
  SpeechError,
  serializeError,
  throwIfAborted,
} from "../src/index.js";
import { speechSdk } from "../src/vite.js";

describe("errors", () => {
  test("serialise and rebuild with their code", () => {
    const rebuilt = deserializeError(serializeError(new SpeechError("mic-busy", "In use.")));
    expect(isSpeechError(rebuilt, "mic-busy")).toBe(true);
    expect(rebuilt.message).toBe("In use.");
  });

  test("plain errors become `internal`, aborts stay aborts, non-errors are stringified", () => {
    expect(isSpeechError(deserializeError(serializeError(new RangeError("x"))), "internal")).toBe(true);
    expect(isAbortError(deserializeError(serializeError(new DOMException("s", "AbortError"))))).toBe(true);
    expect(serializeError(42)).toEqual({ name: "Error", message: "42" });
  });

  test("isAbortError / throwIfAborted", () => {
    expect(isAbortError(new DOMException("x", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("x"))).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
    expect(() => throwIfAborted(AbortSignal.abort(new Error("gone")))).toThrow("gone");
    expect(() => throwIfAborted(undefined)).not.toThrow();
  });

  test("keeps the cause", () => {
    const cause = new Error("root");
    expect(new SpeechError("internal", "wrapped", { cause }).cause).toBe(cause);
  });
});

describe("createStore", () => {
  test("notifies on change only, and stops after unsubscribe", () => {
    const store = createStore({ n: 0 });
    const seen: number[] = [];
    const off = store.subscribe((v) => seen.push(v.n));
    const same = store.get();
    store.set(same); // identical snapshot: no notification
    store.set({ n: 1 });
    off();
    store.set({ n: 2 });
    expect(seen).toEqual([1]);
    expect(store.get().n).toBe(2);
  });
});

describe("createEmitter", () => {
  test("emits typed events to listeners until unsubscribed", () => {
    const e = createEmitter<{ level: (v: number) => void }>();
    const got: number[] = [];
    const off = e.on("level", (v) => got.push(v));
    e.emit("level", 0.5);
    off();
    e.emit("level", 1);
    expect(got).toEqual([0.5]);
  });
});

describe("createSerialQueue", () => {
  test("runs tasks one at a time, in order, and survives failures", async () => {
    const run = createSerialQueue();
    const log: string[] = [];
    const task = (name: string, ms: number) => () =>
      new Promise<string>((r) =>
        setTimeout(() => {
          log.push(name);
          r(name);
        }, ms),
      );
    const a = run(task("a", 20));
    const b = run(() => Promise.reject(new Error("b failed")));
    const c = run(task("c", 1));
    expect(await a).toBe("a");
    await expect(b).rejects.toThrow("b failed");
    expect(await c).toBe("c");
    expect(log).toEqual(["a", "c"]);
  });
});

describe("createChannel", () => {
  test("yields pushed values in order, including ones pushed before iteration", async () => {
    const ch = createChannel<number>();
    ch.push(1);
    setTimeout(() => {
      ch.push(2);
      ch.close();
      ch.push(3); // ignored after close
    });
    const got: number[] = [];
    for await (const v of ch) got.push(v);
    expect(got).toEqual([1, 2]);
  });

  test("delivers buffered values before a failure, then throws it", async () => {
    const ch = createChannel<string>();
    ch.push("a");
    ch.fail(new Error("broken"));
    ch.fail(new Error("ignored"));
    const got: string[] = [];
    await expect(
      (async () => {
        for await (const v of ch) got.push(v);
      })(),
    ).rejects.toThrow("broken");
    expect(got).toEqual(["a"]);
  });

  test("an early break notifies the producer once", async () => {
    const ch = createChannel<number>();
    let returned = 0;
    ch.onReturn(() => returned++);
    ch.push(1);
    ch.push(2);
    for await (const _ of ch) break;
    expect(returned).toBe(1);
    ch.push(3); // ignored: consumer is gone
    const it = ch[Symbol.asyncIterator]();
    expect(await it.next()).toEqual({ value: undefined, done: true });
    await it.return?.();
    expect(returned).toBe(1);
  });
});

describe("capabilities outside a browser", () => {
  test("report nothing available instead of throwing", async () => {
    expect(await detectCapabilities()).toEqual({
      webgpu: false,
      shaderF16: false,
      secureContext: false,
      crossOriginIsolated: false,
      microphone: false,
    });
  });

  test("probeDevice honours an explicit wasm preference and falls back without WebGPU", async () => {
    expect(await probeDevice("wasm")).toEqual({ device: "wasm", shaderF16: false });
    expect(await probeDevice()).toEqual({ device: "wasm", shaderF16: false });
  });
});

describe("speechSdk() Vite plugin", () => {
  const config = (p: ReturnType<typeof speechSdk>) => (p.config as () => Record<string, unknown>)();

  test("keeps the SDKs out of pre-bundling and emits ES-module workers", () => {
    const c = config(speechSdk());
    expect(c.optimizeDeps).toEqual({
      exclude: expect.arrayContaining(["@huggingface/transformers", "@kucukkanat/tts", "@kucukkanat/stt"]),
    });
    expect(c.worker).toEqual({ format: "es" });
    expect(c.server).toBeUndefined();
  });

  test("adds cross-origin isolation headers on request", () => {
    const c = config(speechSdk({ isolation: true }));
    const headers = { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "credentialless" };
    expect(c.server).toEqual({ headers });
    expect(c.preview).toEqual({ headers });
  });
});
