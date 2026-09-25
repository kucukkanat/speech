import { describe, expect, test } from "bun:test";
import { createEngineCore, type Device, isSpeechError, type LoadProgress, SpeechError } from "../src/index.js";

/** An engine whose loads are resolved by hand, plus hooks to emit progress and crashes like a worker would. */
function harness() {
  const loads: Array<{ model: string; resolve: (d: { device: Device }) => void; reject: (e: unknown) => void }> = [];
  let progress: (model: "a" | "b", p: LoadProgress) => void = () => undefined;
  let crash: (e: SpeechError) => void = () => undefined;
  const core = createEngineCore<"a" | "b">({
    model: "a",
    loadModel: (model) => new Promise((resolve, reject) => loads.push({ model, resolve, reject })),
    onProgress: (l) => {
      progress = l;
    },
    onCrash: (l) => {
      crash = l;
    },
  });
  return { core, loads, progress: (m: "a" | "b", p: LoadProgress) => progress(m, p), crash: (e: SpeechError) => crash(e) };
}

describe("createEngineCore", () => {
  test("idle → loading (with progress) → ready", async () => {
    const h = harness();
    const states: string[] = [];
    h.core.status.subscribe((s) => states.push(s.state));
    const seen: number[] = [];
    const load = h.core.load({ onProgress: (p) => seen.push(p.progress) });
    h.progress("a", { progress: 0.5, label: "file" });
    h.progress("b", { progress: 0.9, label: "other model" }); // ignored: not the loading model
    h.loads[0]?.resolve({ device: "webgpu" });
    await load;
    expect(states).toEqual(["loading", "loading", "ready"]);
    expect(seen).toEqual([0.5]);
    expect(h.core.status.get()).toEqual({ state: "ready", model: "a", device: "webgpu" });
    await h.core.load(); // already ready: no new load
    expect(h.loads.length).toBe(1);
  });

  test("concurrent loads share one download", async () => {
    const h = harness();
    const both = Promise.all([h.core.load(), h.core.load()]);
    expect(h.loads.length).toBe(1);
    h.loads[0]?.resolve({ device: "wasm" });
    await both;
  });

  test("a failed load becomes an error status and rejects with a SpeechError; the next load retries", async () => {
    const h = harness();
    const first = h.core.load();
    h.loads[0]?.reject(new Error("network down"));
    const err = await first.catch((e: unknown) => e);
    expect(isSpeechError(err, "model-init-failed")).toBe(true);
    expect(h.core.status.get().state).toBe("error");
    const retry = h.core.load();
    h.loads[1]?.reject(new SpeechError("webgpu-required", "Needs WebGPU."));
    expect(isSpeechError(await retry.catch((e: unknown) => e), "webgpu-required")).toBe(true);
  });

  test("switching models loads the new one; a stale load's result is ignored", async () => {
    const h = harness();
    const a = h.core.load();
    h.core.select("b");
    const b = h.core.load();
    expect(h.loads.map((l) => l.model)).toEqual(["a", "b"]);
    h.loads[1]?.resolve({ device: "webgpu" });
    await b;
    h.loads[0]?.resolve({ device: "wasm" }); // "a" finishing late must not overwrite "b"
    await a;
    expect(h.core.status.get()).toEqual({ state: "ready", model: "b", device: "webgpu" });
    expect(h.core.selected).toBe("b");
  });

  test("a stale failed load doesn't overwrite the current status", async () => {
    const h = harness();
    const a = h.core.load();
    h.core.select("b");
    h.loads[0]?.reject(new Error("late failure"));
    await a.catch(() => undefined);
    expect(h.core.status.get()).toMatchObject({ state: "loading", model: "a" });
  });

  test("aborting stops waiting without cancelling the shared load", async () => {
    const h = harness();
    const controller = new AbortController();
    const waiting = h.core.load({ signal: controller.signal });
    controller.abort(new Error("navigated away"));
    await expect(waiting).rejects.toThrow("navigated away");
    await expect(h.core.load({ signal: AbortSignal.abort(new Error("already gone")) })).rejects.toThrow("already gone");
    h.loads[0]?.resolve({ device: "wasm" });
    await h.core.load();
    expect(h.core.status.get().state).toBe("ready");
  });

  test("a worker crash becomes an error status; reset returns to idle", async () => {
    const h = harness();
    const load = h.core.load();
    h.crash(new SpeechError("worker-crashed", "boom"));
    expect(h.core.status.get()).toMatchObject({ state: "error", model: "a" });
    h.loads[0]?.reject(new SpeechError("worker-crashed", "boom"));
    await load.catch(() => undefined);
    h.core.reset();
    expect(h.core.status.get()).toEqual({ state: "idle" });
  });
});
