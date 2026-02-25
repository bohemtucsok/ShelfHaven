import { test, expect } from "@playwright/test";

test.describe("Export / Import funkciók", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/profile");
    await page.waitForTimeout(2000);
  });

  test("export gomb megjelenik a profil oldalon", async ({ page }) => {
    const exportLink = page.locator("a[href='/api/user/export']");
    await expect(exportLink).toBeVisible();
  });

  test("export link letöltést indít", async ({ page }) => {
    const exportLink = page.locator("a[href='/api/user/export']");
    await expect(exportLink).toBeVisible();
    // Verify it has download attribute
    const hasDownload = await exportLink.getAttribute("download");
    expect(hasDownload !== null || hasDownload === "").toBeTruthy();
  });

  test("import gomb megjelenik a profil oldalon", async ({ page }) => {
    // Import label/button text
    const importLabel = page.locator("text=/import/i").first();
    await expect(importLabel).toBeVisible();
  });

  test("import file input létezik", async ({ page }) => {
    // Hidden file input for import
    const fileInput = page.locator("input[type='file'][accept='.json']");
    const count = await fileInput.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
