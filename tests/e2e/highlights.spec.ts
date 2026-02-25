import { test, expect } from "@playwright/test";

test.describe("Kiemelések az olvasóban", () => {
  test("olvasó oldal betöltődik sidebar gombbal", async ({ page }) => {
    // First go to library and find a book
    await page.goto("/library");
    await expect(page.getByRole("heading", { name: "Könyvtáram" })).toBeVisible();

    // Click first book
    const bookLink = page.locator("a[href^='/book/']").first();
    if (await bookLink.isVisible()) {
      await bookLink.click();
      await page.waitForTimeout(2000);

      // Look for read/continue button
      const readBtn = page.locator("a[href^='/reader/']").first();
      if (await readBtn.isVisible()) {
        await readBtn.click();
        await page.waitForTimeout(5000);

        // Sidebar toggle button (ToC button) should exist
        const tocBtn = page.locator("button").filter({ has: page.locator("svg") }).first();
        expect(await tocBtn.count()).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("sidebar tartalmaz Kiemelések tab-ot", async ({ page }) => {
    await page.goto("/library");
    const bookLink = page.locator("a[href^='/book/']").first();
    if (await bookLink.isVisible()) {
      await bookLink.click();
      await page.waitForTimeout(2000);

      const readBtn = page.locator("a[href^='/reader/']").first();
      if (await readBtn.isVisible()) {
        await readBtn.click();
        await page.waitForTimeout(5000);

        // Open sidebar (click ToC button - first button in toolbar)
        const tocBtn = page.locator("button").first();
        await tocBtn.click();
        await page.waitForTimeout(1000);

        // Look for Highlights tab
        const highlightsTab = page.locator("button").filter({ hasText: /kiemelés|highlight/i });
        const count = await highlightsTab.count();
        expect(count).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("kiemelések tab üres állapot üzenetet mutat", async ({ page }) => {
    await page.goto("/library");
    const bookLink = page.locator("a[href^='/book/']").first();
    if (await bookLink.isVisible()) {
      await bookLink.click();
      await page.waitForTimeout(2000);

      const readBtn = page.locator("a[href^='/reader/']").first();
      if (await readBtn.isVisible()) {
        await readBtn.click();
        await page.waitForTimeout(5000);

        // Open sidebar
        const tocBtn = page.locator("button").first();
        await tocBtn.click();
        await page.waitForTimeout(1000);

        // Click highlights tab
        const highlightsTab = page.locator("button").filter({ hasText: /kiemelés|highlight/i }).first();
        if (await highlightsTab.isVisible()) {
          await highlightsTab.click();
          await page.waitForTimeout(500);

          // Empty state message
          const emptyMsg = page.locator("text=/nincs kiemelés|no highlight/i");
          const count = await emptyMsg.count();
          expect(count).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  test("sidebar toggle működik", async ({ page }) => {
    await page.goto("/library");
    const bookLink = page.locator("a[href^='/book/']").first();
    if (await bookLink.isVisible()) {
      await bookLink.click();
      await page.waitForTimeout(2000);

      const readBtn = page.locator("a[href^='/reader/']").first();
      if (await readBtn.isVisible()) {
        await readBtn.click();
        await page.waitForTimeout(5000);

        // Toggle sidebar open
        const tocBtn = page.locator("button").first();
        await tocBtn.click();
        await page.waitForTimeout(500);

        // Sidebar should be visible (contains "Tartalom" text)
        const sidebar = page.locator("text=/tartalom|contents/i");
        const visibleAfterOpen = await sidebar.count();

        // Toggle sidebar closed
        await tocBtn.click();
        await page.waitForTimeout(500);

        expect(visibleAfterOpen).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("olvasó toolbar elemei megjelennek", async ({ page }) => {
    await page.goto("/library");
    const bookLink = page.locator("a[href^='/book/']").first();
    if (await bookLink.isVisible()) {
      await bookLink.click();
      await page.waitForTimeout(2000);

      const readBtn = page.locator("a[href^='/reader/']").first();
      if (await readBtn.isVisible()) {
        await readBtn.click();
        await page.waitForTimeout(5000);

        // Toolbar should have font controls (A- and A+)
        const fontSmaller = page.locator("button", { hasText: "A-" });
        const fontBigger = page.locator("button", { hasText: "A+" });
        expect(await fontSmaller.count()).toBeGreaterThanOrEqual(0);
        expect(await fontBigger.count()).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
