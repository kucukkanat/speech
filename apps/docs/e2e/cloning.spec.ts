import { expect, test } from "./fixtures";

test("the voice cloning guide records a voice from the microphone and speaks with it", async ({ page }) => {
  await page.goto("guides/voice-cloning");
  const demo = page.getByTestId("try-cloning");
  await demo.getByTestId("voice-name").fill(`Clone ${Date.now()}`);

  // The fake microphone plays a 7 s LibriTTS reading on a loop (packages/voices/assets/male.wav).
  const record = demo.getByTestId("voice-record");
  await record.click();
  await expect(record).toHaveAttribute("data-state", "recording");
  await page.waitForTimeout(8_000);
  await record.click();

  const cloned = demo.getByTestId("cloned-voice");
  await expect(cloned).toBeVisible({ timeout: 60_000 });
  await expect(cloned).toContainText(/\d+(\.\d)? s clip/);
  await cloned.getByTestId("model-load").click();
  const speak = cloned.getByTestId("speak-button");
  await expect(speak).toContainText("Speak as Clone", { timeout: 5 * 60_000 });
  await speak.click();
  await expect(speak).toHaveAttribute("data-state", "ended", { timeout: 5 * 60_000 });
  await expect(cloned.getByTestId("karaoke-sentence").first()).toBeVisible();
  await expect(demo.getByTestId("demo-error")).toHaveCount(0);
});

test("the TTS page's 'Clone a voice' section records and clones a voice", async ({ page }) => {
  await page.goto("packages/tts#clone-a-voice");
  const demo = page.getByTestId("try-cloning");
  await expect(page.getByRole("heading", { name: "Record a voice from the microphone" })).toBeVisible();
  const record = demo.getByTestId("voice-record");
  await record.click();
  await expect(record).toHaveAttribute("data-state", "recording");
  await page.waitForTimeout(6_000);
  await record.click();
  await expect(demo.getByTestId("cloned-voice")).toBeVisible({ timeout: 60_000 });
  await demo.getByTestId("model-load").click();
  const speak = demo.getByTestId("speak-button");
  await speak.click({ timeout: 5 * 60_000 });
  await expect(speak).toHaveAttribute("data-state", "ended", { timeout: 5 * 60_000 });
  await expect(demo.getByTestId("demo-error")).toHaveCount(0);
});
