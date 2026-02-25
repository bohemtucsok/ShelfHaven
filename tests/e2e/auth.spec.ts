import { test, expect } from "@playwright/test";

const uniqueId = Date.now();

test.describe("Regisztráció", () => {
  test("sikeres regisztráció és automatikus bejelentkezés", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: "Regisztráció" })).toBeVisible();

    await page.fill("#name", "Auth Teszt User");
    await page.fill("#email", `authtest_${uniqueId}@test.com`);
    await page.fill("#password", "TestPass123!");
    await page.fill("#confirmPassword", "TestPass123!");
    await page.getByRole("button", { name: "Regisztráció" }).click();

    // Should redirect to library after auto-login
    await page.waitForURL("/library", { timeout: 15000 });
    await expect(page.getByRole("heading", { name: "Könyvtáram" })).toBeVisible();

    // User name should appear in header
    await expect(page.getByText("Auth Teszt User")).toBeVisible();
  });

  test("jelszó mismatch hibaüzenet", async ({ page }) => {
    await page.goto("/register");

    await page.fill("#name", "Test");
    await page.fill("#email", "mismatch@test.com");
    await page.fill("#password", "Pass123!");
    await page.fill("#confirmPassword", "WrongPass!");
    await page.getByRole("button", { name: "Regisztráció" }).click();

    await expect(page.getByText("A jelszavak nem egyeznek")).toBeVisible();
  });

  test("regisztráció link a login oldalról", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("main").getByRole("link", { name: "Regisztráció" }).click();
    await page.waitForURL("/register");
    await expect(page.getByRole("heading", { name: "Regisztráció" })).toBeVisible();
  });
});

test.describe("Bejelentkezés", () => {
  test("sikeres bejelentkezés", async ({ page }) => {
    // First register a user
    const email = `logintest_${uniqueId}@test.com`;
    await page.goto("/register");
    await page.fill("#name", "Login Teszt");
    await page.fill("#email", email);
    await page.fill("#password", "TestPass123!");
    await page.fill("#confirmPassword", "TestPass123!");
    await page.getByRole("button", { name: "Regisztráció" }).click();
    await page.waitForURL("/library", { timeout: 15000 });

    // Log out - hover profile dropdown, then click Kijelentkezés
    await page.locator("header").getByText("Login Teszt").hover();
    await page.getByRole("button", { name: "Kijelentkezés" }).click();
    await expect(page.getByRole("link", { name: "Bejelentkezés" }).first()).toBeVisible({ timeout: 10000 });

    // Log back in
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Bejelentkezés" })).toBeVisible();

    await page.fill("#email", email);
    await page.fill("#password", "TestPass123!");
    await page.getByRole("button", { name: "Bejelentkezés" }).click();

    await page.waitForURL("/library", { timeout: 15000 });
    await expect(page.getByText("Login Teszt")).toBeVisible();
  });

  test("hibás jelszó hibaüzenet", async ({ page }) => {
    await page.goto("/login");

    await page.fill("#email", "nonexistent@test.com");
    await page.fill("#password", "WrongPass!");
    await page.getByRole("button", { name: "Bejelentkezés" }).click();

    await expect(page.getByText("Hibás email cím vagy jelszó")).toBeVisible();
  });

  test("bejelentkezés link a regisztráció oldalról", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("main").getByRole("link", { name: "Bejelentkezés" }).click();
    await page.waitForURL("/login");
    await expect(page.getByRole("heading", { name: "Bejelentkezés" })).toBeVisible();
  });
});

test.describe("Kijelentkezés", () => {
  test("kijelentkezés működik", async ({ page }) => {
    // Register and login
    const email = `logouttest_${uniqueId}@test.com`;
    await page.goto("/register");
    await page.fill("#name", "Logout Teszt");
    await page.fill("#email", email);
    await page.fill("#password", "TestPass123!");
    await page.fill("#confirmPassword", "TestPass123!");
    await page.getByRole("button", { name: "Regisztráció" }).click();
    await page.waitForURL("/library", { timeout: 15000 });

    // Should see user name in header
    await expect(page.getByText("Logout Teszt")).toBeVisible();

    // Hover profile dropdown to reveal logout, then click
    await page.locator("header").getByText("Logout Teszt").hover();
    await page.getByRole("button", { name: "Kijelentkezés" }).click();

    // Should show login/register links instead (in header)
    await expect(page.locator("header").getByRole("link", { name: "Bejelentkezés" })).toBeVisible({ timeout: 10000 });
    await expect(page.locator("header").getByRole("link", { name: "Regisztráció" })).toBeVisible();
  });
});
