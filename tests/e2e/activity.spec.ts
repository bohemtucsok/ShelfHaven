import { test, expect } from "@playwright/test";

test.describe("Hírfolyam", () => {
  test("hírfolyam oldal betöltődik", async ({ page }) => {
    await page.goto("/activity");
    await expect(page.getByRole("heading", { name: /Hírfolyam/ })).toBeVisible({ timeout: 10000 });
  });

  test("hírfolyam leírás megjelenik", async ({ page }) => {
    await page.goto("/activity");
    await expect(page.getByText(/Kövesd, mit csinálnak/)).toBeVisible({ timeout: 10000 });
  });

  test("szűrő gombok megjelennek", async ({ page }) => {
    await page.goto("/activity");
    await expect(page.getByRole("button", { name: "Követettek" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "Mindenki" })).toBeVisible();
  });

  test("szűrő váltás működik", async ({ page }) => {
    await page.goto("/activity");
    await expect(page.getByRole("button", { name: "Követettek" })).toBeVisible({ timeout: 10000 });

    // Click "Everyone" filter
    await page.getByRole("button", { name: "Mindenki" }).click();

    // The "Everyone" button should now be active (amber bg)
    const allBtn = page.getByRole("button", { name: "Mindenki" });
    await expect(allBtn).toHaveClass(/bg-amber-700/);
  });

  test("Mindenki szűrővel aktivitások megjelennek (ha van)", async ({ page }) => {
    await page.goto("/activity");
    await expect(page.getByRole("button", { name: "Mindenki" })).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Mindenki" }).click();
    await page.waitForTimeout(2000);

    // Either activities are shown or the "no activity" message
    const hasActivities = await page.locator(".flex.gap-3.rounded-lg").first().isVisible().catch(() => false);
    const hasNoActivity = await page.getByText(/Még nincs aktivitás/).isVisible().catch(() => false);
    expect(hasActivities || hasNoActivity).toBeTruthy();
  });

  test("header navigációban megjelenik a Hírfolyam dropdown", async ({ page }) => {
    await page.goto("/");
    const header = page.locator("header");
    await expect(header.getByText("Hírfolyam")).toBeVisible({ timeout: 10000 });
  });

  test("header Hírfolyam linkre kattintva navigál", async ({ page }) => {
    await page.goto("/");
    const header = page.locator("header");
    await header.getByText("Hírfolyam").first().hover();
    await header.getByRole("link", { name: "Hírfolyam" }).click();
    await page.waitForURL("/activity");
    await expect(page.getByRole("heading", { name: /Hírfolyam/ })).toBeVisible();
  });

  test("Követettek szűrő üres állapot üzenetet jelez", async ({ page }) => {
    await page.goto("/activity");
    await expect(page.getByRole("button", { name: "Követettek" })).toBeVisible({ timeout: 10000 });

    // Click Following filter (should be default)
    await page.getByRole("button", { name: "Követettek" }).click();
    await page.waitForTimeout(2000);

    // Either activities or empty state message should appear
    const hasContent = await page.locator(".flex.gap-3.rounded-lg").first().isVisible().catch(() => false);
    const hasEmpty = await page.getByText(/A követett felhasználóknak/).isVisible().catch(() => false);
    expect(hasContent || hasEmpty).toBeTruthy();
  });
});
