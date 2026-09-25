import { expect, test } from "./fixtures";

test("transcribes the microphone live with Moonshine", async ({ page }) => {
  await page.goto("/?device=wasm#transcribe");
  const panel = page.getByRole("tabpanel").filter({ has: page.getByTestId("mic-button") });

  await panel.getByTestId("model-option-moonshine-base").click();
  await panel.getByTestId("model-load").click();
  await expect(page.getByTestId("engine-chip-stt")).toHaveAttribute("data-state", "ready", { timeout: 10 * 60_000 });

  // The fake microphone plays "A full hour had passed since his father had gone in with Dan Crosby, the tutor…".
  await panel.getByTestId("mic-button").click();
  const transcript = panel.getByTestId("transcript");
  await expect(transcript).toContainText(/full hour/i, { timeout: 90_000 }); // words appear while it's still talking
  await expect(transcript).toContainText(/university/i, { timeout: 90_000 }); // …through the end of the sentence
  await panel.getByTestId("mic-button").click();
  await expect(panel.getByTestId("mic-button")).toHaveAttribute("aria-pressed", "false");
  await expect(transcript).toContainText(/full hour.*university/is); // the text is kept after stopping
});
