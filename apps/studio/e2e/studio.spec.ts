import { expect, test } from "./fixtures";

test("speaks with a cloned demo voice, follows along sentence by sentence, and replays from history", async ({ page }) => {
  await page.goto("/#studio"); // TTS needs WebGPU in browsers (see the fixture's GPU flags)
  const studio = page.getByRole("tabpanel").filter({ has: page.getByTestId("speak-button") });

  await studio.getByTestId("model-load").click();
  await expect(page.getByTestId("engine-chip-tts")).toHaveAttribute("data-state", "ready", { timeout: 15 * 60_000 });

  await studio.getByTestId("persona-option-builtin-aria").click();
  await studio
    .locator("textarea")
    .fill("The lighthouse keeper climbed the stairs one last time. Below him, the calm sea shimmered under the moon.");
  const speak = studio.getByTestId("speak-button");
  await speak.click();
  await expect(speak).toHaveAttribute("data-state", "playing", { timeout: 5 * 60_000 });
  await expect(speak).toHaveAttribute("data-state", "ended", { timeout: 5 * 60_000 });

  // Both sentences were announced as they started playing, in order.
  await expect(studio.getByTestId("karaoke-sentence")).toHaveCount(2);
  await expect(studio.getByTestId("karaoke-sentence").first()).toContainText("lighthouse keeper");

  // The finished speech is in the history and replays through the same player.
  const item = studio.getByTestId("history-item");
  await expect(item).toHaveCount(1);
  await item.getByTestId("history-replay").click();
  await expect(speak).toHaveAttribute("data-state", "playing");
  await expect(speak).toHaveAttribute("data-state", "ended", { timeout: 60_000 });
});
