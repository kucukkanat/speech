import { expect, test } from "./fixtures";

test("personas saved by the old app (IndexedDB v1) are migrated and listed", async ({ page }) => {
  // Recreate the pre-SDK database before any app code runs. IndexedDB serves delete/open requests for a database in
  // the order they were issued, so the app's own open (v2) sees exactly this v1 database and upgrades it.
  await page.addInitScript(() => {
    indexedDB.deleteDatabase("voice-lab");
    const open = indexedDB.open("voice-lab", 1);
    open.onupgradeneeded = () => {
      const store = open.result.createObjectStore("personas", { keyPath: "id" });
      store.createIndex("by-created", "createdAt");
      const wav = new Blob([new Uint8Array(44)], { type: "audio/wav" });
      store.put({
        id: "legacy-1",
        name: "Legacy Lena",
        colors: ["#123456", "#654321"],
        emoji: "🦊",
        builtIn: false,
        createdAt: 99,
        clip: wav,
        clipSeconds: 6.5,
      });
    };
    open.onsuccess = () => open.result.close();
  });
  await page.goto("/#personas");
  const card = page.getByTestId("persona-card").filter({ hasText: "Legacy Lena" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("6.5 s clip");
  // The bundled demo voices are still seeded next to it.
  await expect(page.locator('[data-testid="persona-card"][data-persona-id="builtin-aria"]')).toBeVisible();
});
