import { test, expect } from "@playwright/test";

test.describe("Polcok kezelés", () => {
  test("Polcaim oldal betöltődik", async ({ page }) => {
    await page.goto("/shelves");
    await expect(page.getByRole("heading", { name: "Polcaim" })).toBeVisible();
  });

  test("új polc létrehozása", async ({ page }) => {
    await page.goto("/shelves");
    await expect(page.getByRole("heading", { name: "Polcaim" })).toBeVisible();

    // Click create button
    await page.getByRole("button", { name: "Új polc létrehozása" }).first().click();

    // Modal should appear
    await expect(page.getByLabel("Polc neve")).toBeVisible();

    // Fill form
    const shelfName = `Teszt Polc ${Date.now()}`;
    await page.fill("#shelf-name", shelfName);
    await page.fill("#shelf-desc", "E2E teszt polc leírás");

    // Submit - use exact match for the modal's submit button
    await page.getByRole("button", { name: "Létrehozás", exact: true }).click();

    // Modal should close and shelf should appear
    await expect(page.getByText(shelfName)).toBeVisible({ timeout: 5000 });
  });

  test("polc törlése", async ({ page }) => {
    await page.goto("/shelves");
    await expect(page.getByRole("heading", { name: "Polcaim" })).toBeVisible();

    // Create a shelf first
    await page.getByRole("button", { name: "Új polc létrehozása" }).first().click();
    const shelfName = `Torlendo Polc ${Date.now()}`;
    await page.fill("#shelf-name", shelfName);
    await page.getByRole("button", { name: "Létrehozás", exact: true }).click();
    await expect(page.getByText(shelfName)).toBeVisible({ timeout: 5000 });

    // Hover over shelf card to reveal delete button, then click it
    const shelfCard = page.getByText(shelfName).locator("../..");
    await shelfCard.hover();
    await shelfCard.getByTitle("Polc törlése").click();

    // Confirmation modal
    await expect(page.getByText("Polc törlése").last()).toBeVisible();
    await expect(page.getByText("Biztosan törölni szeretnéd?")).toBeVisible();

    // Confirm deletion - use the red button in the modal
    await page.getByRole("button", { name: "Törlés", exact: true }).click();

    // Shelf should disappear
    await expect(page.getByText(shelfName)).not.toBeVisible({ timeout: 5000 });
  });

  test("polc létrehozás modal bezárása Mégse gombbal", async ({ page }) => {
    await page.goto("/shelves");
    await expect(page.getByRole("heading", { name: "Polcaim" })).toBeVisible();

    await page.getByRole("button", { name: "Új polc létrehozása" }).first().click();
    await expect(page.getByLabel("Polc neve")).toBeVisible();

    // Cancel
    await page.getByRole("button", { name: "Mégse" }).click();

    // Modal should close
    await expect(page.getByLabel("Polc neve")).not.toBeVisible();
  });

  test("polc részletek oldal", async ({ page }) => {
    await page.goto("/shelves");
    await expect(page.getByRole("heading", { name: "Polcaim" })).toBeVisible();

    // Create a shelf
    await page.getByRole("button", { name: "Új polc létrehozása" }).first().click();
    const shelfName = `Reszletek Polc ${Date.now()}`;
    await page.fill("#shelf-name", shelfName);
    await page.fill("#shelf-desc", "Reszletek teszt");
    await page.getByRole("button", { name: "Létrehozás", exact: true }).click();
    await expect(page.getByText(shelfName)).toBeVisible({ timeout: 5000 });

    // Click on the shelf to go to details
    await page.getByRole("link", { name: shelfName }).click();
    await page.waitForURL(/\/shelves\/.+/);

    // Should show shelf name
    await expect(page.getByRole("heading", { name: shelfName })).toBeVisible();
  });
});
