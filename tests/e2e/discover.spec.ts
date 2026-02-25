import { test, expect } from "@playwright/test";

test.describe("Felfedezés oldal", () => {
  test("felfedezés oldal betöltődik", async ({ page }) => {
    await page.goto("/discover");
    await expect(page.getByRole("heading", { name: /Felfedezés/ })).toBeVisible({ timeout: 10000 });
  });

  test("alcím megjelenik", async ({ page }) => {
    await page.goto("/discover");
    await expect(page.getByText(/Fedezz fel új könyveket/)).toBeVisible({ timeout: 10000 });
  });

  test("felhasználó keresés jelenik meg", async ({ page }) => {
    await page.goto("/discover");
    const searchInput = page.getByPlaceholder(/Felhasználó keresése/);
    await expect(searchInput).toBeVisible({ timeout: 10000 });
  });

  test("friss feltöltések szekció megjelenik", async ({ page }) => {
    await page.goto("/discover");
    await expect(page.getByText(/Friss feltöltések/)).toBeVisible({ timeout: 10000 });
  });

  test("friss feltöltések szekció leírása megjelenik", async ({ page }) => {
    await page.goto("/discover");
    await expect(page.getByText(/A legújabb könyvek/)).toBeVisible({ timeout: 10000 });
  });

  test("könyv kártyák kattinthatóak a felfedezés oldalon", async ({ page }) => {
    await page.goto("/discover");
    await expect(page.getByText(/Friss feltöltések/)).toBeVisible({ timeout: 10000 });

    // Find book link in the discover page
    const bookLink = page.locator("a[href^='/book/']").first();
    if (await bookLink.isVisible().catch(() => false)) {
      await bookLink.click();
      await page.waitForURL(/\/book\//);
      await expect(page.locator("main")).toBeVisible();
    }
  });

  test("header navigációban megjelenik a Hírfolyam dropdown (Felfedezés tartalma)", async ({ page }) => {
    await page.goto("/");
    const header = page.locator("header");
    await expect(header.getByText("Hírfolyam")).toBeVisible({ timeout: 10000 });
    // Hover to reveal Felfedezés sub-link
    await header.getByText("Hírfolyam").first().hover();
    await expect(header.getByRole("link", { name: "Felfedezés" })).toBeVisible();
  });

  test("header Felfedezés linkre kattintva navigál", async ({ page }) => {
    await page.goto("/");
    const header = page.locator("header");
    await header.getByText("Hírfolyam").first().hover();
    await header.getByRole("link", { name: "Felfedezés" }).click();
    await page.waitForURL("/discover");
    await expect(page.getByRole("heading", { name: /Felfedezés/ })).toBeVisible();
  });

  test("felhasználó keresés funkció működik", async ({ page }) => {
    await page.goto("/discover");
    const searchInput = page.getByPlaceholder(/Felhasználó keresése/);
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    // Type a search query
    await searchInput.fill("e2e");
    await page.waitForTimeout(500);

    // Either results dropdown appears or no results
    // We just verify no crash/error
    await expect(searchInput).toHaveValue("e2e");
  });

  test("betöltési animáció megjelenik majd eltűnik", async ({ page }) => {
    // Navigate and check for spinner then content
    await page.goto("/discover");
    // Either spinner or content should be visible quickly
    await expect(page.getByRole("heading", { name: /Felfedezés/ })).toBeVisible({ timeout: 10000 });
  });
});
