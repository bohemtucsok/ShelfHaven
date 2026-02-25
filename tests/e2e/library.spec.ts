import { test, expect } from "@playwright/test";

test.describe("Könyvtár oldal", () => {
  test("betöltődik és megjeleníti a fejlécet", async ({ page }) => {
    await page.goto("/library");

    await expect(page.getByRole("heading", { name: "Könyvtáram" })).toBeVisible();
    // Book count text (e.g. "5 könyv")
    await expect(page.getByText(/\d+ könyv/)).toBeVisible();
  });

  test("nézet váltás (Polc / Rács)", async ({ page }) => {
    await page.goto("/library");
    await expect(page.getByRole("heading", { name: "Könyvtáram" })).toBeVisible();

    // Default: shelf view
    const shelfBtn = page.getByRole("button", { name: "Polc" });
    const gridBtn = page.getByRole("button", { name: "Rács" });

    await expect(shelfBtn).toBeVisible();
    await expect(gridBtn).toBeVisible();

    // Switch to grid
    await gridBtn.click();
    // Grid button should now be active (amber-700 background = white text)
    await expect(gridBtn).toHaveClass(/text-white/);

    // Switch back to shelf
    await shelfBtn.click();
    await expect(shelfBtn).toHaveClass(/text-white/);
  });

  test("kategória szűrők megjelennek", async ({ page }) => {
    await page.goto("/library");
    await expect(page.getByRole("heading", { name: "Könyvtáram" })).toBeVisible();

    // "Összes" button should be present
    await expect(page.getByRole("button", { name: "Összes" })).toBeVisible();

    // At least one category button should exist besides "Összes"
    const categoryButtons = page.locator("button").filter({ hasText: /Szépirodalom|Informatika|Ismeretterjesztő|Gyerekkönyvek/ });
    const count = await categoryButtons.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("kategória szűrés működik", async ({ page }) => {
    await page.goto("/library");
    await expect(page.getByRole("heading", { name: "Könyvtáram" })).toBeVisible();

    // Click a category
    await page.getByRole("button", { name: /Szépirodalom/ }).click();

    // "Összes" should no longer be active
    const osszesBtn = page.getByRole("button", { name: "Összes" });
    await expect(osszesBtn).not.toHaveClass(/text-white/);

    // Click Összes to reset
    await osszesBtn.click();
    await expect(osszesBtn).toHaveClass(/text-white/);
  });

  test("keresés a könyvtár oldalon", async ({ page }) => {
    await page.goto("/library");
    await expect(page.getByRole("heading", { name: "Könyvtáram" })).toBeVisible();

    const searchInput = page.getByPlaceholder("Keresés cím vagy szerző alapján...");
    await searchInput.fill("teszt");
    await searchInput.press("Enter");

    // URL should update
    await page.waitForURL(/\/library\?q=teszt/);

    // Search indicator should appear
    await expect(page.getByText(/teszt/)).toBeVisible();
  });

  test("keresés törlése", async ({ page }) => {
    await page.goto("/library?q=teszt");

    // Search indicator should be visible
    await expect(page.getByText(/teszt/)).toBeVisible();

    // Click X to clear search
    await page.getByTitle("Keresés törlése").click();

    // URL should reset
    await page.waitForURL("/library");
  });

  test("Könyv feltöltése gomb megjelenik", async ({ page }) => {
    await page.goto("/library");
    await expect(page.getByRole("heading", { name: "Könyvtáram" })).toBeVisible();

    const uploadLink = page.getByRole("link", { name: "Könyv feltöltése" });
    await expect(uploadLink).toBeVisible();
    await uploadLink.click();
    await page.waitForURL("/upload");
  });
});
