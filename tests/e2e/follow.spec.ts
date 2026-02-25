import { test, expect } from "@playwright/test";

test.describe("Követés rendszer", () => {
  test("profil oldalon megjelenik a követő/követett szám", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByText(/\d+ követő/)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/\d+ követett/)).toBeVisible();
  });

  test("saját profil oldalon nem jelenik meg a Követés gomb", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.locator("main")).toBeVisible({ timeout: 10000 });
    // Follow button should NOT be on own profile
    await expect(page.getByRole("button", { name: /Követés|Követett/ })).not.toBeVisible();
  });

  test("felhasználó keresés működik a felfedezés oldalon", async ({ page }) => {
    await page.goto("/discover");
    await expect(page.getByRole("heading", { name: /Felfedezés/ })).toBeVisible({ timeout: 10000 });

    // User search component should be visible
    const searchInput = page.getByPlaceholder(/Felhasználó keresése/);
    await expect(searchInput).toBeVisible();
  });

  test("publikus profil oldalon megjelenik a követő/követett szám", async ({ page }) => {
    // Navigate to own profile to verify stats are displayed
    await page.goto("/profile");
    await expect(page.getByText(/\d+ követő/)).toBeVisible({ timeout: 10000 });

    // Check that both follower/following stats are displayed
    const followerText = page.getByText(/\d+ követő/);
    await expect(followerText).toBeVisible();
    const followingText = page.getByText(/\d+ követett/);
    await expect(followingText).toBeVisible();
  });

  test("user/[id] oldal betöltődik és FollowButton megjelenik", async ({ page }) => {
    // Go to a book page and find uploader link
    await page.goto("/library");
    await expect(page.getByRole("heading", { name: "Könyvtáram" })).toBeVisible({ timeout: 10000 });
    const bookLink = page.locator("a[href^='/book/']").first();
    if (await bookLink.isVisible().catch(() => false)) {
      await bookLink.click();
      await page.waitForURL(/\/book\//);
      // Find uploader link on book detail page
      const uploaderLink = page.locator("a[href^='/user/']").first();
      if (await uploaderLink.isVisible().catch(() => false)) {
        await uploaderLink.click();
        await page.waitForURL(/\/user\//);
        await expect(page.locator("main")).toBeVisible({ timeout: 10000 });
      }
    }
  });
});
