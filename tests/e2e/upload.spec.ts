import { test, expect } from "@playwright/test";

test.describe("Feltöltés oldal", () => {
  test("feltöltés form betöltődik", async ({ page }) => {
    await page.goto("/upload");

    await expect(page.getByRole("heading", { name: /Könyv feltöltése/i })).toBeVisible();

    // Drag & drop zone or file input should be present
    await expect(page.getByText(/Húzd ide/i).or(page.getByText(/Válassz fájlt/i))).toBeVisible();
  });

  test("kategória chipek megjelennek", async ({ page }) => {
    await page.goto("/upload");
    await expect(page.getByRole("heading", { name: /Könyv feltöltése/i })).toBeVisible();

    // Wait for categories to load
    await expect(page.getByText("Kategória")).toBeVisible({ timeout: 5000 });

    // Known categories from seed
    await expect(page.getByRole("button", { name: /Szépirodalom/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Informatika/ })).toBeVisible();
  });

  test("téma chipek megjelennek", async ({ page }) => {
    await page.goto("/upload");
    await expect(page.getByRole("heading", { name: /Könyv feltöltése/i })).toBeVisible();

    // Wait for topics to load
    await expect(page.getByText("Témák (opcionális)")).toBeVisible({ timeout: 5000 });

    // Known topics from seed
    await expect(page.getByRole("button", { name: /Sci-fi/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Fantasy/ })).toBeVisible();
  });

  test("navigáció a feltöltés oldalra a headerből", async ({ page }) => {
    await page.goto("/");
    await page.locator("header").getByRole("link", { name: "Feltöltés" }).click();
    await page.waitForURL("/upload");
    await expect(page.getByRole("heading", { name: /Könyv feltöltése/i })).toBeVisible();
  });
});
