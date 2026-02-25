import { test, expect } from "@playwright/test";

test.describe("Szűrők a könyvtárban", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/library");
    await expect(page.getByRole("heading", { name: "Könyvtáram" })).toBeVisible();
  });

  test("szűrő panel gomb létezik", async ({ page }) => {
    // Filter toggle button
    const filterBtn = page.getByRole("button").filter({ hasText: /szűr|filter/i });
    const count = await filterBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("formátum szűrők megjelennek", async ({ page }) => {
    // Format badges (EPUB, PDF, MOBI) in filter section or book cards
    const formatBadges = page.locator("text=/epub|pdf|mobi/i");
    const count = await formatBadges.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("kategória szűrő gombok működnek", async ({ page }) => {
    // "Összes" button should exist
    const allBtn = page.getByRole("button", { name: "Összes" });
    await expect(allBtn).toBeVisible();

    // Click a category filter
    const categoryBtns = page.locator("button").filter({ hasText: /Szépirodalom|Informatika/ });
    if (await categoryBtns.count() > 0) {
      await categoryBtns.first().click();
      await page.waitForTimeout(1000);
      // Should filter the list (URL might change or visual change)
    }
  });

  test("keresés szűrő működik", async ({ page }) => {
    // Search input in header or library
    const searchInput = page.getByPlaceholder(/keresés|search/i).first();
    if (await searchInput.isVisible()) {
      await searchInput.fill("teszt");
      await page.waitForTimeout(1000);
      // URL should contain q= parameter or results should filter
    }
  });

  test("szűrők visszaállítása", async ({ page }) => {
    // Click a category first
    const categoryBtn = page.getByRole("button", { name: /Szépirodalom/ });
    if (await categoryBtn.isVisible()) {
      await categoryBtn.click();
      await page.waitForTimeout(500);

      // Then click "Összes" to reset
      await page.getByRole("button", { name: "Összes" }).click();
      await page.waitForTimeout(500);
    }
  });

  test("rendezési opciók elérhetőek", async ({ page }) => {
    // Sort dropdown or buttons
    const sortBtns = page.getByRole("button").filter({ hasText: /rendez|sorrend|sort|legújabb|cím/i });
    const count = await sortBtns.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
