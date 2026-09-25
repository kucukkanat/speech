import { expect, test } from "./fixtures";

test("every docs page renders under the /speech/ base and the sidebar reaches them all", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1, name: "Introduction" })).toBeVisible();
  const links = await page.locator("nav a[href^='/speech/']").evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
  expect(links).toEqual(
    expect.arrayContaining(["/speech/getting-started", "/speech/playground", "/speech/packages/tts", "/speech/guides/hosting"]),
  );
  for (const href of links) {
    const response = await page.goto(`http://localhost:5461${href}`);
    expect(response?.status(), href ?? "").toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
  }
});
