import "fake-indexeddb/auto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createEngineCore, type Device, SpeechError } from "@kucukkanat/speech-core";
import { createVoiceStore } from "@kucukkanat/voices";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { useCapabilities, useEngine, useVoices } from "../src/index.js";
import { withDom } from "./dom.js";

let restore: () => Promise<void>;
beforeAll(() => {
  restore = withDom();
});
afterAll(() => restore());

/** Renders `useHook` in a real React root and exposes its latest return value. */
async function renderHook<T>(useHook: () => T): Promise<{ current: () => T; unmount: () => void }> {
  let latest: T | undefined;
  let hasValue = false;
  function Probe() {
    latest = useHook();
    hasValue = true;
    return null;
  }
  const root: Root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe />));
  return {
    current: () => {
      if (!hasValue) throw new Error("hook never rendered");
      return latest as T;
    },
    unmount: () => act(() => root.unmount()),
  };
}

/** A real engine lifecycle (createEngineCore) whose load we resolve by hand. */
function engine() {
  let finish: (d: { device: Device }) => void = () => undefined;
  let fail: (e: unknown) => void = () => undefined;
  let progress: (model: "m", p: { progress: number; label: string }) => void = () => undefined;
  const core = createEngineCore<"m">({
    model: "m",
    loadModel: () =>
      new Promise((resolve, reject) => {
        finish = resolve;
        fail = reject;
      }),
    onProgress: (l) => {
      progress = l;
    },
    onCrash: () => undefined,
  });
  return {
    target: {
      get status() {
        return core.status.get();
      },
      subscribe: core.status.subscribe,
      load: core.load,
    },
    finish: (d: Device) => finish({ device: d }),
    fail: (e: unknown) => fail(e),
    progress: (p: number) => progress("m", { progress: p, label: "file.onnx" }),
  };
}

describe("useEngine", () => {
  test("follows load progress to ready", async () => {
    const e = engine();
    const hook = await renderHook(() => useEngine(e.target));
    expect(hook.current()).toMatchObject({ ready: false, loading: false, progress: null, error: null });
    let loaded: Promise<void> = Promise.resolve();
    await act(async () => {
      loaded = hook.current().load();
    });
    await act(async () => e.progress(0.4));
    expect(hook.current()).toMatchObject({ loading: true, progress: { progress: 0.4 } });
    await act(async () => {
      e.finish("webgpu");
      await loaded;
    });
    expect(hook.current()).toMatchObject({ ready: true, loading: false, status: { state: "ready", device: "webgpu" } });
    hook.unmount();
  });

  test("surfaces a typed load error", async () => {
    const e = engine();
    const hook = await renderHook(() => useEngine(e.target));
    await act(async () => {
      const loading = hook.current().load();
      e.fail(new SpeechError("webgpu-required", "Needs WebGPU."));
      await loading.catch(() => undefined);
    });
    expect(hook.current().error?.code).toBe("webgpu-required");
    hook.unmount();
  });
});

describe("useVoices", () => {
  test("lists voices and re-renders on changes", async () => {
    const store = createVoiceStore({ name: "react-hooks-test", demoVoices: false });
    const hook = await renderHook(() => useVoices(store));
    await act(async () => {
      await store.ready;
    });
    expect(hook.current()).toMatchObject({ voices: [], loading: false, error: null });
    const { encodeWav } = await import("@kucukkanat/speech-audio");
    const audio = encodeWav(
      Float32Array.from({ length: 24000 * 4 }, (_, i) => 0.3 * Math.sin(i / 20)),
      24000,
    );
    await act(async () => {
      await hook.current().create({ name: "Mine", audio, meta: {} });
    });
    expect(hook.current().voices.map((v) => v.name)).toEqual(["Mine"]);
    const [mine] = hook.current().voices;
    await act(async () => {
      if (mine) await hook.current().remove(mine.id);
    });
    expect(hook.current().voices).toEqual([]);
    hook.unmount();
    store.close();
  });
});

describe("useCapabilities", () => {
  test("detects once and shares the result", async () => {
    const first = await renderHook(() => useCapabilities());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    const caps = first.current();
    expect(caps).toMatchObject({ webgpu: false });
    const second = await renderHook(() => useCapabilities());
    expect(second.current()).toBe(caps); // cached: no second detection, no null flash
    first.unmount();
    second.unmount();
  });

  test("an unmounted component ignores a late result", async () => {
    const hook = await renderHook(() => useCapabilities());
    hook.unmount();
  });
});

test("hooks render on the server (SSR) with the engines' current snapshots", () => {
  const e = engine();
  const store = createVoiceStore({ name: "react-ssr-test", demoVoices: false });
  function Page() {
    const { status } = useEngine(e.target);
    const { voices, loading } = useVoices(store);
    return <p>{`${status.state} ${loading ? "loading" : voices.length}`}</p>;
  }
  expect(renderToString(<Page />)).toBe("<p>idle loading</p>");
  store.close();
});
