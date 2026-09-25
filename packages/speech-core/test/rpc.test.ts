import { afterEach, describe, expect, test } from "bun:test";
import { createRpcClient, isSpeechError, type RpcClient, SpeechError } from "../src/index.js";
import type { EchoProtocol } from "./fixtures/echo.worker.js";

const spawn = () => new Worker(new URL("./fixtures/echo.worker.ts", import.meta.url), { type: "module" });

let client: RpcClient<EchoProtocol, string>;
afterEach(() => client?.dispose());

describe("createRpcClient (real worker)", () => {
  test("round-trips a call", async () => {
    client = createRpcClient<EchoProtocol, string>(spawn);
    expect(await client.call("echo", "hello")).toBe("hello");
  });

  test("answers ping once the worker is up", async () => {
    client = createRpcClient<EchoProtocol, string>(spawn);
    await client.ping();
  });

  test("streams per-call events before the result", async () => {
    client = createRpcClient<EchoProtocol, string>(spawn);
    const seen: number[] = [];
    expect(await client.call("count", 3, { onEvent: (n) => seen.push(n) })).toBe(3);
    expect(seen).toEqual([1, 2, 3]);
  });

  test("transfers buffers both ways", async () => {
    client = createRpcClient<EchoProtocol, string>(spawn);
    const input = Float32Array.from([1, 2, 3]);
    const out = await client.call("double", input, { transfer: [input.buffer] });
    expect(input.byteLength).toBe(0); // moved, not copied
    expect(Array.from(out)).toEqual([2, 4, 6]);
  });

  test("keeps SpeechError codes across the boundary", async () => {
    client = createRpcClient<EchoProtocol, string>(spawn);
    const err = await client.call("fail", "speech").catch((e: unknown) => e);
    expect(isSpeechError(err, "empty-text")).toBe(true);
    expect((err as SpeechError).message).toBe("Nothing to say.");
  });

  test("reports unexpected worker errors as `internal`", async () => {
    client = createRpcClient<EchoProtocol, string>(spawn);
    expect(isSpeechError(await client.call("fail", "plain").catch((e: unknown) => e), "internal")).toBe(true);
    expect(isSpeechError(await client.call("fail", "string").catch((e: unknown) => e), "internal")).toBe(true);
  });

  test("keeps worker-side aborts as AbortError", async () => {
    client = createRpcClient<EchoProtocol, string>(spawn);
    const err = await client.call("fail", "abort").catch((e: unknown) => e);
    expect((err as Error).name).toBe("AbortError");
  });

  test("an aborted signal rejects with its reason and cancels the worker-side task", async () => {
    client = createRpcClient<EchoProtocol, string>(spawn);
    const controller = new AbortController();
    const call = client.call("wait", 10_000, { signal: controller.signal });
    controller.abort(new Error("user cancelled"));
    await expect(call).rejects.toThrow("user cancelled");
    // The worker is still healthy afterwards.
    expect(await client.call("wait", 1)).toBe("finished");
  });

  test("an already-aborted signal rejects without calling the worker", async () => {
    client = createRpcClient<EchoProtocol, string>(spawn);
    await expect(client.call("echo", "x", { signal: AbortSignal.abort(new Error("too late")) })).rejects.toThrow("too late");
  });

  test("delivers broadcasts to listeners until they unsubscribe", async () => {
    client = createRpcClient<EchoProtocol, string>(spawn);
    const got: string[] = [];
    const off = client.onBroadcast((s) => got.push(s));
    await client.call("announce", "first");
    off();
    await client.call("announce", "second");
    expect(got).toEqual(["first"]);
  });

  test("a crash rejects pending calls with worker-crashed, notifies, and respawns on the next call", async () => {
    client = createRpcClient<EchoProtocol, string>(spawn);
    const crashes: string[] = [];
    const off = client.onCrash((e) => crashes.push(e.code));
    const err = await client.call("crash", undefined).catch((e: unknown) => e);
    expect(isSpeechError(err, "worker-crashed")).toBe(true);
    expect((err as Error).message).toContain("worker exploded");
    expect(crashes).toEqual(["worker-crashed"]);
    off();
    expect(await client.call("echo", "alive again")).toBe("alive again");
  });

  test("rejects unknown methods", async () => {
    client = createRpcClient<EchoProtocol, string>(spawn);
    const untyped = client as unknown as RpcClient<{ nope: { arg: undefined; result: undefined; event: never } }, never>;
    const err = await untyped.call("nope", undefined).catch((e: unknown) => e);
    expect(isSpeechError(err, "internal")).toBe(true);
  });

  test("dispose rejects pending and future calls with `disposed`", async () => {
    client = createRpcClient<EchoProtocol, string>(spawn);
    const pending = client.call("wait", 10_000);
    client.dispose();
    client.dispose(); // idempotent
    expect(isSpeechError(await pending.catch((e: unknown) => e), "disposed")).toBe(true);
    expect(isSpeechError(await client.call("echo", "x").catch((e: unknown) => e), "disposed")).toBe(true);
  });
});

test("SpeechError instances carry their code", () => {
  const e = new SpeechError("busy", "One session at a time.");
  expect(e).toBeInstanceOf(Error);
  expect(e.name).toBe("SpeechError");
  expect(isSpeechError(e)).toBe(true);
  expect(isSpeechError(e, "busy")).toBe(true);
  expect(isSpeechError(e, "disposed")).toBe(false);
  expect(isSpeechError(new Error("x"))).toBe(false);
});
