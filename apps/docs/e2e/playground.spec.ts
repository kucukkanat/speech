import { expect, FAKE_MIC_WAV, test } from "./fixtures";

test("the playground speaks with a demo voice, sentence by sentence", async ({ page }) => {
  await page.goto("playground");
  const playground = page.getByTestId("playground");
  await expect(playground.getByTestId("capabilities")).toContainText("WebGPU ✓");

  await playground.getByTestId("model-load").first().click();
  const speak = playground.getByTestId("speak-button");
  await expect(speak).toBeVisible({ timeout: 15 * 60_000 }); // first run downloads Chatterbox Turbo (~725 MB)
  await expect(playground.getByTestId("tts-voice")).toContainText("Aria");

  await playground
    .getByTestId("tts-text")
    .fill("The lighthouse keeper climbed the stairs one last time. Below him, the calm sea shimmered under the moon.");
  await speak.click();
  await expect(speak).toHaveAttribute("data-state", "playing", { timeout: 5 * 60_000 });
  await expect(speak).toHaveAttribute("data-state", "ended", { timeout: 5 * 60_000 });
  await expect(playground.getByTestId("karaoke-sentence")).toHaveCount(2);
  await expect(playground.getByTestId("demo-error")).toHaveCount(0);
});

test("the playground transcribes the microphone live", async ({ page }) => {
  await page.goto("playground");
  const playground = page.getByTestId("playground");
  await playground.getByTestId("tab-transcribe").click();
  const panel = playground.getByRole("tabpanel").filter({ has: page.getByTestId("stt-model") });
  await panel.getByTestId("model-load").click();
  const mic = panel.getByTestId("mic-button");
  await mic.click({ timeout: 10 * 60_000 }); // first run downloads Moonshine (~158 MB)
  await expect(mic).toHaveAttribute("data-state", "listening");
  // The fake microphone plays packages/voices/assets/male.wav (see CREDITS.md for its words).
  await expect(panel.getByTestId("transcript")).not.toContainText("Listening", { timeout: 2 * 60_000 });
  await expect(panel.getByTestId("transcript")).toContainText(/hour|father|tutor|university/i);
  await mic.click();
  await expect(mic).toHaveAttribute("data-state", "idle");
});

test("the voice library lists the demo voices", async ({ page }) => {
  await page.goto("playground");
  await page.getByTestId("tab-voices").click();
  const items = page.getByTestId("playground").getByTestId("voice-item");
  await expect(items.filter({ hasText: "Aria" })).toHaveCount(1);
  await expect(items.filter({ hasText: "Orion" })).toHaveCount(1);
});

test("an inline demo on the TTS page shares the loaded engine and speaks", async ({ page }) => {
  await page.goto("packages/tts");
  const demo = page.getByTestId("try-speak");
  await demo.getByTestId("model-load").click(); // cached from the playground test: loads from the browser cache
  const speak = demo.getByTestId("speak-button");
  await speak.click({ timeout: 5 * 60_000 });
  await expect(speak).toHaveAttribute("data-state", "ended", { timeout: 5 * 60_000 });
  await expect(demo.getByTestId("karaoke-sentence").first()).toBeVisible();
});

test("sampling parameters are adjustable, reset to the model's defaults, and reach the engine", async ({ page }) => {
  await page.goto("playground");
  const playground = page.getByTestId("playground");
  await playground.getByTestId("model-load").first().click();
  const temperature = playground.getByTestId("tts-sampling-temperature");
  await expect(temperature).toBeVisible({ timeout: 5 * 60_000 });
  await expect(playground.getByTestId("tts-sampling-temperature-value")).toHaveText("0.80");

  await temperature.fill("0.5");
  await playground.getByTestId("tts-sampling-repetitionPenalty").fill("1.5");
  await playground.getByTestId("tts-buffering").uncheck();
  await expect(playground.getByTestId("tts-sampling-temperature-value")).toHaveText("0.50");

  const speak = playground.getByTestId("speak-button");
  await playground.getByTestId("tts-text").fill("A calm, steady and deliberate voice reads this sentence aloud.");
  await speak.click();
  await expect(speak).toHaveAttribute("data-state", "ended", { timeout: 5 * 60_000 });
  await expect(playground.getByTestId("karaoke-sentence")).toHaveCount(1);
  await expect(playground.getByTestId("demo-error")).toHaveCount(0);

  await playground.getByTestId("tts-sampling-reset").click();
  await expect(playground.getByTestId("tts-sampling-temperature-value")).toHaveText("0.80");
  await expect(playground.getByTestId("tts-sampling-repetitionPenalty-value")).toHaveText("1.20");
});

test("speech-to-text runs on the WASM backend when chosen", async ({ page }) => {
  await page.goto("playground?stt-device=wasm");
  const playground = page.getByTestId("playground");
  await playground.getByTestId("tab-transcribe").click();
  const panel = playground.getByRole("tabpanel").filter({ has: page.getByTestId("stt-model") });
  await expect(panel.getByTestId("stt-device")).toHaveValue("wasm");
  await panel.getByTestId("model-load").click();
  await panel.getByTestId("stt-file").setInputFiles(FAKE_MIC_WAV, { timeout: 10 * 60_000 }); // first run downloads Moonshine for WASM
  await expect(panel.getByTestId("file-transcript")).toContainText(/hour|father|tutor|university/i, { timeout: 2 * 60_000 });
});

test("voices can be added with manual cropping, removed and restored", async ({ page }) => {
  await page.goto("playground");
  await page.getByTestId("tab-voices").click();
  const playground = page.getByTestId("playground");
  const name = `Upload ${Date.now()}`;
  await playground.getByTestId("voice-name").fill(name);
  await playground.getByTestId("voice-crop").selectOption("none");
  await playground.getByTestId("voice-max-seconds").fill("5");
  await playground.getByTestId("voice-file").setInputFiles(FAKE_MIC_WAV);
  const item = playground.getByTestId("voice-item").filter({ hasText: name });
  await expect(item).toContainText("· 5.0 s"); // the 7 s file, cut at max length instead of auto-cropped

  await item.getByTestId("voice-remove").click();
  await expect(item).toHaveCount(0);
  await playground.getByTestId("voice-undo").click();
  await expect(item).toHaveCount(1);
  await item.getByTestId("voice-remove").click(); // leave the shared profile as it was
});
