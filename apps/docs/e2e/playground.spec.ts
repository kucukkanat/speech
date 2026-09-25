import { expect, test } from "./fixtures";

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
