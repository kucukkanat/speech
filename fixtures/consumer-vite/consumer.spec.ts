import { expect, test } from "@playwright/test";

test("the packed SDKs work in a fresh Vite app", async ({ page }) => {
  await page.goto("/");
  const results = await page.waitForFunction(() => (window as unknown as { __results?: unknown }).__results, null, { timeout: 120_000 });
  expect(await results.jsonValue()).toEqual({
    tts: "webgpu-required", // this browser has no WebGPU: the worker booted and explained why it can't run the model
    stt: "model-download-failed",
    voices: [
      ["Aria", 7],
      ["Orion", 7],
    ],
    frame: 1280,
    mic: true,
    react: "function",
    caps: "boolean",
  });
});
