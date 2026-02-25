import { test, expect } from "@playwright/test";

test.describe("Főoldal", () => {
  test("megjeleníti a hero szekciót és navigációt", async ({ page }) => {
    await page.goto("/");

    // Logo visible in header
    await expect(page.locator("header").getByText("ShelfHaven")).toBeVisible();

    // Hero heading
    await expect(page.getByRole("heading", { name: "ShelfHaven", level: 1 })).toBeVisible();

    // Navigation dropdowns in header
    const header = page.locator("header");
    await expect(header.getByText("Könyvtár")).toBeVisible();
    await expect(header.getByText("Feltöltés")).toBeVisible();
  });

  test("bejelentkezett felhasználó látja a Feltöltés linket és a dropdown menüket", async ({ page }) => {
    await page.goto("/");

    const header = page.locator("header");
    await expect(header.getByRole("link", { name: "Feltöltés" })).toBeVisible();
    // Könyvtár dropdown contains Polcaim (visible on hover)
    await expect(header.getByText("Könyvtár")).toBeVisible();
    await expect(header.getByText("Hírfolyam")).toBeVisible();
  });

  test("navigáció a Könyvtár oldalra", async ({ page }) => {
    await page.goto("/");
    // Hover on Könyvtár dropdown trigger, then click the Könyvtár link
    const header = page.locator("header");
    await header.getByText("Könyvtár").first().hover();
    await header.getByRole("link", { name: "Könyvtár" }).first().click();
    await page.waitForURL("/library");
    await expect(page.getByRole("heading", { name: "Könyvtáram" })).toBeVisible();
  });

  test("header keresés a Könyvtár oldalra navigál", async ({ page }) => {
    await page.goto("/");

    const searchInput = page.getByPlaceholder("Keresés...");
    await searchInput.fill("teszt");
    await searchInput.press("Enter");

    await page.waitForURL(/\/library\?q=teszt/);
    await expect(page.getByRole("heading", { name: "Könyvtáram" })).toBeVisible();
  });
});
