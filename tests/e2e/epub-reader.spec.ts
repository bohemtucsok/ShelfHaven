import { test, expect, type Page } from "@playwright/test";
import path from "path";

// Helper: navigate to the library page, find the first book with an EPUB reader link,
// and return the book ID.  If no books exist, upload the test EPUB first.
async function getReaderBookId(page: Page): Promise<string | null> {
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Könyvtáram" })).toBeVisible({ timeout: 10000 });

  // Try to find a book link
  const bookLink = page.locator("a[href^='/book/']").first();
  const hasBooks = await bookLink.isVisible().catch(() => false);

  if (hasBooks) {
    const href = await bookLink.getAttribute("href");
    if (href) {
      const id = href.replace("/book/", "");
      return id;
    }
  }

  // No books found - try uploading the test EPUB
  const uploaded = await uploadTestEpub(page);
  return uploaded;
}

// Helper: upload the test EPUB file and return the new book ID
async function uploadTestEpub(page: Page): Promise<string | null> {
  await page.goto("/upload");
  await expect(page.getByRole("heading", { name: /Könyv feltöltése/i })).toBeVisible({ timeout: 10000 });

  // Upload the test EPUB file
  const testEpubPath = path.resolve(__dirname, "../../Teszt_Szerzo-Teszt_Konyv.epub");
  const fileInput = page.locator("input[type='file']");
  await fileInput.setInputFiles(testEpubPath);

  // Wait for metadata to be extracted (title should appear)
  await page.waitForTimeout(2000);

  // Select a category if required
  const categoryBtn = page.getByRole("button", { name: /Szépirodalom/ });
  const hasCategoryBtn = await categoryBtn.isVisible().catch(() => false);
  if (hasCategoryBtn) {
    await categoryBtn.click();
  }

  // Submit the form
  const submitBtn = page.getByRole("button", { name: /Feltöltés/i }).last();
  const canSubmit = await submitBtn.isEnabled().catch(() => false);
  if (canSubmit) {
    await submitBtn.click();
    // Upload redirects to /library after success
    await page.waitForURL(/\/library/, { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Find the newly uploaded book in the library
    const bookLink = page.locator("a[href^='/book/']").first();
    const isVisible = await bookLink.isVisible().catch(() => false);
    if (isVisible) {
      const href = await bookLink.getAttribute("href");
      if (href) {
        return href.replace("/book/", "");
      }
    }
  }

  return null;
}

test.describe("EPUB olvasó", () => {
  let bookId: string | null = null;

  test.beforeEach(async ({ page }) => {
    if (!bookId) {
      bookId = await getReaderBookId(page);
    }
  });

  test("olvasó oldal betöltődik és toolbar megjelenik", async ({ page }) => {
    if (!bookId) {
      test.skip(true, "Nincs elérhető könyv az olvasóhoz");
      return;
    }

    await page.goto(`/reader/${bookId}`);

    // Wait for loading to finish
    await expect(page.getByText("Könyv betöltése...")).toBeHidden({ timeout: 30000 });

    // Toolbar should be visible with the font size controls
    await expect(page.getByRole("button", { name: "A-" })).toBeVisible();
    await expect(page.getByRole("button", { name: "A+" })).toBeVisible();

    // Font family buttons should be visible
    await expect(page.getByRole("button", { name: "Serif" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sans" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mono" })).toBeVisible();

    // Dark mode toggle button should exist
    await expect(page.getByTitle(/mód/)).toBeVisible();

    // "Vissza" link to book page
    await expect(page.getByText("Vissza")).toBeVisible();
  });

  test("betűméret változtatás", async ({ page }) => {
    if (!bookId) {
      test.skip(true, "Nincs elérhető könyv az olvasóhoz");
      return;
    }

    await page.goto(`/reader/${bookId}`);
    await expect(page.getByText("Könyv betöltése...")).toBeHidden({ timeout: 30000 });

    // Default font size should be 100%
    await expect(page.getByText("100%")).toBeVisible();

    // Click A+ to increase
    await page.getByRole("button", { name: "A+" }).click();
    await expect(page.getByText("110%")).toBeVisible();

    // Click A+ again
    await page.getByRole("button", { name: "A+" }).click();
    await expect(page.getByText("120%")).toBeVisible();

    // Click A- to decrease
    await page.getByRole("button", { name: "A-" }).click();
    await expect(page.getByText("110%")).toBeVisible();

    // Click A- twice to go back to 100% then below
    await page.getByRole("button", { name: "A-" }).click();
    await expect(page.getByText("100%")).toBeVisible();

    await page.getByRole("button", { name: "A-" }).click();
    await expect(page.getByText("90%")).toBeVisible();
  });

  test("betűtípus váltás (Serif/Sans/Mono)", async ({ page }) => {
    if (!bookId) {
      test.skip(true, "Nincs elérhető könyv az olvasóhoz");
      return;
    }

    await page.goto(`/reader/${bookId}`);
    await expect(page.getByText("Könyv betöltése...")).toBeHidden({ timeout: 30000 });

    const serifBtn = page.getByRole("button", { name: "Serif" });
    const sansBtn = page.getByRole("button", { name: "Sans" });
    const monoBtn = page.getByRole("button", { name: "Mono" });

    // Serif should be active by default (bg-amber-200 class)
    await expect(serifBtn).toHaveClass(/bg-amber-200/);

    // Switch to Sans
    await sansBtn.click();
    await expect(sansBtn).toHaveClass(/bg-amber-200/);
    await expect(serifBtn).not.toHaveClass(/bg-amber-200/);

    // Switch to Mono
    await monoBtn.click();
    await expect(monoBtn).toHaveClass(/bg-amber-200/);
    await expect(sansBtn).not.toHaveClass(/bg-amber-200/);

    // Switch back to Serif
    await serifBtn.click();
    await expect(serifBtn).toHaveClass(/bg-amber-200/);
    await expect(monoBtn).not.toHaveClass(/bg-amber-200/);
  });

  test("sötét mód váltás", async ({ page }) => {
    if (!bookId) {
      test.skip(true, "Nincs elérhető könyv az olvasóhoz");
      return;
    }

    await page.goto(`/reader/${bookId}`);
    await expect(page.getByText("Könyv betöltése...")).toBeHidden({ timeout: 30000 });

    // Initially light mode - the reader container should have light background
    const readerContainer = page.locator(".absolute.inset-0.flex.flex-col");
    await expect(readerContainer).toHaveClass(/bg-\[#fefbf6\]/);

    // Click dark mode toggle (title contains "Sötét mód")
    await page.getByTitle("Sötét mód").click();

    // Background should switch to dark
    await expect(readerContainer).toHaveClass(/bg-\[#1a1410\]/);

    // The button title should now say "Világos mód"
    await expect(page.getByTitle("Világos mód")).toBeVisible();

    // Toggle back to light
    await page.getByTitle("Világos mód").click();
    await expect(readerContainer).toHaveClass(/bg-\[#fefbf6\]/);
  });

  test("tartalomjegyzék megnyitás", async ({ page }) => {
    if (!bookId) {
      test.skip(true, "Nincs elérhető könyv az olvasóhoz");
      return;
    }

    await page.goto(`/reader/${bookId}`);
    await expect(page.getByText("Könyv betöltése...")).toBeHidden({ timeout: 30000 });

    // Sidebar should not be visible initially
    await expect(page.getByText("Tartalomjegyzék")).toBeHidden();

    // Click ToC button
    await page.getByTitle("Tartalomjegyzék").click();

    // Sidebar should appear with "Tartalom" and "Könyvjelzők" tabs
    await expect(page.getByText("Tartalomjegyzék")).toBeVisible();
    await expect(page.getByRole("button", { name: "Tartalom", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Könyvjelzők/ })).toBeVisible();

    // Close the sidebar by clicking ToC button again
    await page.getByTitle("Tartalomjegyzék").click();
    await expect(page.getByText("Tartalomjegyzék")).toBeHidden();
  });

  test("könyvjelző mentés", async ({ page }) => {
    if (!bookId) {
      test.skip(true, "Nincs elérhető könyv az olvasóhoz");
      return;
    }

    await page.goto(`/reader/${bookId}`);
    await expect(page.getByText("Könyv betöltése...")).toBeHidden({ timeout: 30000 });

    // Wait for EPUB rendition to fully load (location must be available for bookmark)
    await page.waitForTimeout(3000);

    // Click bookmark save button
    await page.getByTitle("Könyvjelző mentése").click();

    // A green checkmark indicator should appear briefly
    const checkmark = page.locator("span").filter({ hasText: "\u2713" });
    await expect(checkmark).toBeVisible({ timeout: 10000 });

    // The checkmark should disappear after ~2 seconds
    await expect(checkmark).toBeHidden({ timeout: 5000 });

    // Verify bookmark appears in the sidebar bookmarks tab
    await page.getByTitle("Tartalomjegyzék").click();
    await page.getByRole("button", { name: /Könyvjelzők/ }).click();

    // There should be at least one bookmark now (not the "Nincs mentett" message)
    await expect(page.getByText("Nincs mentett könyvjelző")).toBeHidden({ timeout: 5000 });
  });

  test("lapozás gombok megjelennek és kattinthatóak", async ({ page }) => {
    if (!bookId) {
      test.skip(true, "Nincs elérhető könyv az olvasóhoz");
      return;
    }

    await page.goto(`/reader/${bookId}`);
    await expect(page.getByText("Könyv betöltése...")).toBeHidden({ timeout: 30000 });

    // Previous and next navigation buttons should exist (they use SVG chevron icons)
    // The prev button is on the left side, next on the right
    const prevBtn = page.locator("button.absolute.left-0");
    const nextBtn = page.locator("button.absolute.right-0");

    await expect(prevBtn).toBeVisible();
    await expect(nextBtn).toBeVisible();

    // Click next page
    await nextBtn.click();
    await page.waitForTimeout(500);

    // Click previous page
    await prevBtn.click();
    await page.waitForTimeout(500);

    // Both buttons should still be visible and interactive
    await expect(prevBtn).toBeVisible();
    await expect(nextBtn).toBeVisible();
  });

  test("teljes képernyő gomb megjelenik", async ({ page }) => {
    if (!bookId) {
      test.skip(true, "Nincs elérhető könyv az olvasóhoz");
      return;
    }

    await page.goto(`/reader/${bookId}`);
    await expect(page.getByText("Könyv betöltése...")).toBeHidden({ timeout: 30000 });

    // Fullscreen button should be visible with title "Teljes képernyő"
    const fullscreenBtn = page.getByTitle("Teljes képernyő");
    await expect(fullscreenBtn).toBeVisible();

    // Button should contain the expand icon
    await expect(fullscreenBtn).toContainText("⊞");
  });

  test("előrehaladás sáv megjelenik alul", async ({ page }) => {
    if (!bookId) {
      test.skip(true, "Nincs elérhető könyv az olvasóhoz");
      return;
    }

    await page.goto(`/reader/${bookId}`);
    await expect(page.getByText("Könyv betöltése...")).toBeHidden({ timeout: 30000 });

    // Bottom progress bar should be visible
    // It shows a percentage text and a progress bar div
    const progressBar = page.locator(".h-1\\.5.overflow-hidden.rounded-full");
    await expect(progressBar).toBeVisible();

    // Percentage text should be visible (e.g. "0%")
    const percentText = page.locator("span").filter({ hasText: /^\d+%$/ }).last();
    await expect(percentText).toBeVisible();
  });

  test("fejléc sötét mód váltásnál megváltozik", async ({ page }) => {
    if (!bookId) {
      test.skip(true, "Nincs elérhető könyv az olvasóhoz");
      return;
    }

    await page.goto(`/reader/${bookId}`);
    await expect(page.getByText("Könyv betöltése...")).toBeHidden({ timeout: 30000 });

    // ReaderView header (the one with "Vissza" link) - initially light
    const header = page.locator("div.flex.items-center.justify-between").filter({ has: page.getByText("Vissza") }).first();
    await expect(header).toHaveClass(/bg-amber-50/);

    // Toggle dark mode
    await page.getByTitle("Sötét mód").click();

    // Header should switch to dark background
    await expect(header).toHaveClass(/bg-\[#211a12\]/);

    // Toggle back
    await page.getByTitle("Világos mód").click();
    await expect(header).toHaveClass(/bg-amber-50/);
  });

  test("könyvjelzők tab váltás a sidebarban", async ({ page }) => {
    if (!bookId) {
      test.skip(true, "Nincs elérhető könyv az olvasóhoz");
      return;
    }

    await page.goto(`/reader/${bookId}`);
    await expect(page.getByText("Könyv betöltése...")).toBeHidden({ timeout: 30000 });

    // Open sidebar
    await page.getByTitle("Tartalomjegyzék").click();

    // Default tab should be "Tartalom" (ToC)
    const tocTab = page.getByRole("button", { name: "Tartalom", exact: true });
    const bookmarksTab = page.getByRole("button", { name: /Könyvjelzők/ });

    await expect(tocTab).toHaveClass(/border-b-2/);
    await expect(page.getByText("Tartalomjegyzék")).toBeVisible();

    // Switch to bookmarks tab
    await bookmarksTab.click();
    await expect(bookmarksTab).toHaveClass(/border-b-2/);

    // Switch back to ToC tab
    await tocTab.click();
    await expect(tocTab).toHaveClass(/border-b-2/);
    await expect(page.getByText("Tartalomjegyzék")).toBeVisible();
  });
});
