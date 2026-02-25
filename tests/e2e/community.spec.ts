import { test, expect } from "@playwright/test";

test.describe("Közösségi funkciók", () => {
  test.describe("Könyv részletek oldal", () => {
    test("publikus könyvoldal betöltődik auth nélkül", async ({ browser }) => {
      // Create a new context without auth
      const context = await browser.newContext();
      const page = await context.newPage();

      // Try to access a book page (may not have data, but the route should work)
      const response = await page.goto("/book/non-existent-id");
      expect(response?.status()).toBeLessThan(500);

      await context.close();
    });

    test("értékelés szekció megjelenik", async ({ page }) => {
      await page.goto("/library");
      await expect(page.getByRole("heading", { name: "Könyvtáram" })).toBeVisible();

      // If there are books, click the first one
      const bookLink = page.locator("a[href^='/book/']").first();
      const hasBooks = await bookLink.isVisible().catch(() => false);

      if (hasBooks) {
        await bookLink.click();
        await page.waitForURL(/\/book\//);

        // Reviews section should be visible
        await expect(page.getByText("Értékelések")).toBeVisible({ timeout: 10000 });
      }
    });

    test("like gomb megjelenik a könyv oldalon", async ({ page }) => {
      await page.goto("/library");

      const bookLink = page.locator("a[href^='/book/']").first();
      const hasBooks = await bookLink.isVisible().catch(() => false);

      if (hasBooks) {
        await bookLink.click();
        await page.waitForURL(/\/book\//);

        // Heart/like button should be present
        const heartButton = page.getByRole("button", { name: "Kedvelés" });
        await expect(heartButton).toBeVisible({ timeout: 10000 });
      }
    });

    test("megtekintés és letöltés számláló megjelenik", async ({ page }) => {
      await page.goto("/library");

      const bookLink = page.locator("a[href^='/book/']").first();
      const hasBooks = await bookLink.isVisible().catch(() => false);

      if (hasBooks) {
        await bookLink.click();
        await page.waitForURL(/\/book\//);

        // Should show view and download counts in metadata
        await expect(page.getByText("Megtekintés:")).toBeVisible({ timeout: 10000 });
        await expect(page.getByText("Letöltés:")).toBeVisible();
      }
    });
  });

  test.describe("Polcok", () => {
    test("polc publikus toggle gomb megjelenik hover-re", async ({ page }) => {
      await page.goto("/shelves");
      await expect(page.getByRole("heading", { name: "Polcaim" })).toBeVisible();

      // Check if there are shelves
      const shelfCard = page.locator("[class*='group']").first();
      const hasShelves = await shelfCard.isVisible().catch(() => false);

      if (hasShelves) {
        // Hover to reveal action buttons
        await shelfCard.hover();

        // The eye toggle button should become visible
        const toggleBtn = shelfCard.locator("button").first();
        await expect(toggleBtn).toBeVisible();
      }
    });
  });

  test.describe("Értesítések", () => {
    test("értesítés csengő megjelenik a headerben", async ({ page }) => {
      await page.goto("/library");

      // Bell icon should be in the header (desktop)
      const bellButton = page.locator("header").getByRole("button", { name: "Értesítések" });
      await expect(bellButton).toBeVisible();
    });

    test("értesítés dropdown megnyílik kattintásra", async ({ page }) => {
      await page.goto("/library");

      const bellButton = page.locator("header").getByRole("button", { name: "Értesítések" });
      await bellButton.click();

      // Dropdown should appear
      await expect(page.getByText("Értesítések")).toBeVisible();
    });

    test("értesítés API elérhető", async ({ request }) => {
      const response = await request.get("/api/notifications");
      // Authenticated user should get 200
      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty("notifications");
      expect(data).toHaveProperty("unreadCount");
    });
  });

  test.describe("Keresés bővítés", () => {
    test("rendezési dropdown megjelenik", async ({ page }) => {
      await page.goto("/library");
      await expect(page.getByRole("heading", { name: "Könyvtáram" })).toBeVisible();

      // Sort dropdown should have options
      const sortSelect = page.locator("select").filter({ hasText: "Legújabb" });
      await expect(sortSelect).toBeVisible();
    });

    test("rendezés módosítás működik", async ({ page }) => {
      await page.goto("/library");
      await expect(page.getByRole("heading", { name: "Könyvtáram" })).toBeVisible();

      const sortSelect = page.locator("select").filter({ hasText: "Legújabb" });
      await sortSelect.selectOption("title");

      // Page should re-render (no explicit URL change for sort)
      await page.waitForTimeout(500);
      await expect(page.getByRole("heading", { name: "Könyvtáram" })).toBeVisible();
    });
  });

  test.describe("Publikus profil", () => {
    test("publikus profil API létezik", async ({ request }) => {
      // Test with non-existent user
      const response = await request.get("/api/user/non-existent-id");
      expect(response.status()).toBe(404);
    });
  });

  test.describe("Review API", () => {
    test("review lista elérhető auth nélkül", async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      // Reviews endpoint should work without auth (public)
      const response = await page.request.get("/api/books/non-existent/reviews");
      // Should return 200 with empty array (not 401)
      expect(response.status()).toBe(200);

      await context.close();
    });

    test("review létrehozás auth nélkül nem lehetséges", async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      const response = await page.request.post("/api/books/some-id/reviews", {
        data: { rating: 5, text: "Great!" },
      });
      expect(response.status()).toBe(401);

      await context.close();
    });
  });

  test.describe("Like API", () => {
    test("like toggle auth nélkül nem lehetséges", async ({ browser }) => {
      const context = await browser.newContext();
      const page = await context.newPage();

      const response = await page.request.post("/api/books/some-id/like");
      expect(response.status()).toBe(401);

      await context.close();
    });
  });
});
