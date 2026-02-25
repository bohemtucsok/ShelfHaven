import { test, expect } from "@playwright/test";

test.describe("Navigáció", () => {
  test("header linkek működnek (bejelentkezett)", async ({ page }) => {
    await page.goto("/");
    const header = page.locator("header");

    // Könyvtár (dropdown)
    await header.getByText("Könyvtár").first().hover();
    await header.getByRole("link", { name: "Könyvtár" }).first().click();
    await page.waitForURL("/library");
    await expect(page.getByRole("heading", { name: "Könyvtáram" })).toBeVisible();

    // Polcaim (inside Könyvtár dropdown)
    await header.getByText("Könyvtár").first().hover();
    await header.getByRole("link", { name: "Polcaim" }).click();
    await page.waitForURL("/shelves");
    await expect(page.getByRole("heading", { name: "Polcaim" })).toBeVisible();

    // Feltöltés (direct link)
    await header.getByRole("link", { name: "Feltöltés" }).click();
    await page.waitForURL("/upload");

    // Logo → főoldal
    await header.getByText("ShelfHaven").click();
    await page.waitForURL("/");
  });

  test("profil link működik", async ({ page }) => {
    await page.goto("/");
    const header = page.locator("header");

    // Click on user name in header (profile dropdown trigger), then click Profil
    const profileTrigger = header.getByText(/Profil|E2E Teszt/).first();
    await profileTrigger.hover();
    await header.getByRole("link", { name: "Profil" }).click();
    await page.waitForURL("/profile");
  });

  test("footer linkek léteznek", async ({ page }) => {
    await page.goto("/");

    const footer = page.locator("footer");
    await expect(footer.getByRole("link", { name: "Könyvtár" })).toBeVisible();
    await expect(footer.getByRole("link", { name: "Polcaim" })).toBeVisible();
  });
});

test.describe("Témák oldal", () => {
  test("témák oldal betöltődik", async ({ page }) => {
    await page.goto("/topics");

    // Should display topics from seed
    await expect(page.getByText(/Krimi|Sci-fi|Fantasy/).first()).toBeVisible({ timeout: 5000 });
  });
});
