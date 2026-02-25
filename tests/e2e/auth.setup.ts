import { test as setup, expect } from "@playwright/test";
import path from "path";

const TEST_USER = {
  name: "E2E Teszt Felhasznalo",
  email: `e2etest_${Date.now()}@test.com`,
  password: "TestPass123!",
};

setup("register and authenticate test user", async ({ page, context }) => {
  // Set Hungarian locale cookie before navigating
  await context.addCookies([{ name: "locale", value: "hu", domain: "localhost", path: "/" }]);

  // Register new test user
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "Regisztráció" })).toBeVisible();

  await page.fill("#name", TEST_USER.name);
  await page.fill("#email", TEST_USER.email);
  await page.fill("#password", TEST_USER.password);
  await page.fill("#confirmPassword", TEST_USER.password);
  await page.getByRole("button", { name: "Regisztráció" }).click();

  // Wait for redirect to library after successful registration + auto-login
  await page.waitForURL("/library", { timeout: 15000 });
  await expect(page.getByRole("heading", { name: "Könyvtáram" })).toBeVisible({ timeout: 10000 });

  // Upload a test book so E2E tests that require books don't skip
  await page.goto("/upload");
  await expect(page.getByRole("heading", { name: /Könyv feltöltése/i })).toBeVisible({ timeout: 10000 });

  const testEpubPath = path.resolve(__dirname, "../../Teszt_Szerzo-Teszt_Konyv.epub");
  const fileInput = page.locator("input[type='file']");
  await fileInput.setInputFiles(testEpubPath);

  // Wait for metadata extraction
  await page.waitForTimeout(2000);

  // Select a category if available
  const categoryBtn = page.getByRole("button", { name: /Szépirodalom/ });
  if (await categoryBtn.isVisible().catch(() => false)) {
    await categoryBtn.click();
  }

  // Submit the upload form
  const submitBtn = page.getByRole("button", { name: /Feltöltés/i }).last();
  if (await submitBtn.isEnabled().catch(() => false)) {
    await submitBtn.click();
    await page.waitForURL(/\/library/, { timeout: 30000 });
    // Verify the book appears
    await expect(page.locator("a[href^='/book/']").first()).toBeVisible({ timeout: 10000 });
  }

  // Save authenticated state (with the uploaded book context)
  await page.context().storageState({ path: "tests/e2e/.auth/user.json" });
});
