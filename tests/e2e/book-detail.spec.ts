import { test, expect } from "@playwright/test";

test.describe("Könyv részletek oldal", () => {
  // Helper: navigate to library, find the first book, go to its detail page.
  // Returns the book ID (from the URL) or null if no books exist.
  async function navigateToFirstBook(page: import("@playwright/test").Page): Promise<string | null> {
    await page.goto("/library");
    await expect(page.getByRole("heading", { name: "Könyvtáram" })).toBeVisible();

    const bookLink = page.locator("a[href^='/book/']").first();
    const hasBooks = await bookLink.isVisible().catch(() => false);

    if (!hasBooks) return null;

    await bookLink.click();
    await page.waitForURL(/\/book\//);

    const url = page.url();
    const match = url.match(/\/book\/(.+)$/);
    return match ? match[1] : null;
  }

  test("könyv részletek oldal betöltődik", async ({ page }) => {
    const bookId = await navigateToFirstBook(page);

    if (!bookId) {
      test.skip(true, "Nincs könyv a könyvtárban");
      return;
    }

    // Title (h1) should be visible
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 10000 });

    // Author text should be visible (the <p> right after h1)
    const authorText = page.locator("h1 + p");
    await expect(authorText).toBeVisible();

    // "Vissza a könyvtárba" back link
    await expect(page.getByText("Vissza a könyvtárba")).toBeVisible();
  });

  test("borítókép megjelenik", async ({ page }) => {
    const bookId = await navigateToFirstBook(page);

    if (!bookId) {
      test.skip(true, "Nincs könyv a könyvtárban");
      return;
    }

    // Either a real cover image or the fallback placeholder should be present
    const coverImage = page.locator("img[alt]").first();
    const fallbackEmoji = page.getByText("\uD83D\uDCD6"); // book emoji fallback

    const hasCover = await coverImage.isVisible().catch(() => false);
    const hasFallback = await fallbackEmoji.isVisible().catch(() => false);

    expect(hasCover || hasFallback).toBeTruthy();

    // If there's a real cover image, verify it loaded (naturalWidth > 0)
    if (hasCover) {
      const naturalWidth = await coverImage.evaluate(
        (img: HTMLImageElement) => img.naturalWidth
      );
      expect(naturalWidth).toBeGreaterThan(0);
    }
  });

  test("borítókép proxy API működik", async ({ page, request }) => {
    const bookId = await navigateToFirstBook(page);

    if (!bookId) {
      test.skip(true, "Nincs könyv a könyvtárban");
      return;
    }

    const response = await request.get(`/api/books/${bookId}/cover`);

    // The response is either 200 (cover exists) or 404 (no cover)
    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const contentType = response.headers()["content-type"];
      expect(contentType).toMatch(/^image\//);
    }
  });

  test("könyv metaadatok megjelennek", async ({ page }) => {
    const bookId = await navigateToFirstBook(page);

    if (!bookId) {
      test.skip(true, "Nincs könyv a könyvtárban");
      return;
    }

    // Wait for the page to fully load
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 10000 });

    // Format label
    await expect(page.getByText("Formátum:")).toBeVisible();

    // Size label
    await expect(page.getByText("Méret:")).toBeVisible();

    // View count label
    await expect(page.getByText("Megtekintés:")).toBeVisible();

    // Download count label
    await expect(page.getByText("Letöltés:")).toBeVisible();
  });

  test("olvasási előrehaladás megjelenik", async ({ page }) => {
    const bookId = await navigateToFirstBook(page);

    if (!bookId) {
      test.skip(true, "Nincs könyv a könyvtárban");
      return;
    }

    await expect(page.locator("h1").first()).toBeVisible({ timeout: 10000 });

    // Reading progress is only shown if the book has been read (percentage > 0).
    // We check if it is present; if not, the test passes gracefully.
    const progressLabel = page.getByText("Olvasási előrehaladás");
    const hasProgress = await progressLabel.isVisible().catch(() => false);

    if (hasProgress) {
      // The percentage text (e.g. "42%") should be visible
      await expect(page.locator("text=/%/")).toBeVisible();

      // The progress bar (inner div with bg-amber-700)
      const progressBar = page.locator(".bg-amber-700").first();
      await expect(progressBar).toBeVisible();
    }
  });

  test("Folytatás/Olvasás gomb", async ({ page }) => {
    const bookId = await navigateToFirstBook(page);

    if (!bookId) {
      test.skip(true, "Nincs könyv a könyvtárban");
      return;
    }

    await expect(page.locator("h1").first()).toBeVisible({ timeout: 10000 });

    // The read button shows "Olvasás" or "Folytatás" depending on progress
    const readButton = page.getByRole("link", { name: /Olvasás|Folytatás/ });
    const hasReadButton = await readButton.isVisible().catch(() => false);

    if (hasReadButton) {
      // Verify it links to the reader page
      const href = await readButton.getAttribute("href");
      expect(href).toBe(`/reader/${bookId}`);

      // Click and verify navigation
      await readButton.click();
      await page.waitForURL(`/reader/${bookId}`);
    }
    // If the read button is not visible, it means the book format is not EPUB
    // and conversion is not completed - this is expected behavior.
  });

  test("Letöltés gomb", async ({ page }) => {
    const bookId = await navigateToFirstBook(page);

    if (!bookId) {
      test.skip(true, "Nincs könyv a könyvtárban");
      return;
    }

    await expect(page.locator("h1").first()).toBeVisible({ timeout: 10000 });

    // Download link
    const downloadLink = page.getByRole("link", { name: "Letöltés" });
    await expect(downloadLink).toBeVisible();

    // Should have download attribute
    const hasDownload = await downloadLink.getAttribute("download");
    expect(hasDownload).not.toBeNull();
  });

  test("Szerkesztés gomb és inline szerkesztés", async ({ page }) => {
    const bookId = await navigateToFirstBook(page);

    if (!bookId) {
      test.skip(true, "Nincs könyv a könyvtárban");
      return;
    }

    await expect(page.locator("h1").first()).toBeVisible({ timeout: 10000 });

    // Edit button is only visible for the book owner
    const editButton = page.getByRole("button", { name: "Szerkesztés" });
    const isOwner = await editButton.isVisible().catch(() => false);

    if (!isOwner) {
      // Not the owner, skip edit test
      return;
    }

    await editButton.click();

    // Edit UI should appear with input fields
    const titleLabel = page.getByText("Cím", { exact: true });
    await expect(titleLabel).toBeVisible({ timeout: 5000 });

    const authorLabel = page.getByText("Szerző", { exact: true });
    await expect(authorLabel).toBeVisible();

    const descriptionLabel = page.getByText("Leírás", { exact: true });
    await expect(descriptionLabel).toBeVisible();

    // Category and topic chip selectors should be visible (scoped to main to avoid header/footer matches)
    await expect(page.locator("main").getByText("Kategóriák", { exact: true }).first()).toBeVisible();
    await expect(page.locator("main").getByText("Témák", { exact: true }).first()).toBeVisible();

    // Save and Cancel buttons
    await expect(page.getByRole("button", { name: "Mentés" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mégse" })).toBeVisible();

    // Click Cancel to close edit mode
    await page.getByRole("button", { name: "Mégse" }).click();

    // Edit UI should disappear, h1 should be visible again
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("Polcra helyezés", async ({ page }) => {
    const bookId = await navigateToFirstBook(page);

    if (!bookId) {
      test.skip(true, "Nincs könyv a könyvtárban");
      return;
    }

    await expect(page.locator("h1").first()).toBeVisible({ timeout: 10000 });

    // "Polcra" button should be visible for authenticated users
    const shelfButton = page.getByRole("button", { name: "Polcra" });
    await expect(shelfButton).toBeVisible();

    // Click to open shelf picker dropdown
    await shelfButton.click();

    // Dropdown should appear - either shelf list or "Nincs polcod még" message
    const dropdown = page.locator(".absolute.left-0.top-full").first();
    await expect(dropdown).toBeVisible({ timeout: 5000 });
  });

  test("Törlés gomb", async ({ page }) => {
    const bookId = await navigateToFirstBook(page);

    if (!bookId) {
      test.skip(true, "Nincs könyv a könyvtárban");
      return;
    }

    await expect(page.locator("h1").first()).toBeVisible({ timeout: 10000 });

    // Delete button is only visible for the book owner
    const deleteButton = page.getByRole("button", { name: "Törlés" });
    const isOwner = await deleteButton.isVisible().catch(() => false);

    if (!isOwner) {
      // Not the owner - that's okay, test passes
      return;
    }

    // Click delete button
    await deleteButton.click();

    // Confirmation modal should appear (use heading role to avoid matching the button text too)
    await expect(page.getByRole("heading", { name: "Könyv törlése" })).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByText("Biztosan törölni szeretnéd")
    ).toBeVisible();

    // Cancel the deletion (we don't actually want to delete in the test)
    await page.getByRole("button", { name: "Mégse" }).click();

    // Modal should close
    await expect(
      page.getByText("Biztosan törölni szeretnéd")
    ).not.toBeVisible();
  });

  test("borítókép proxy 404 érvénytelen ID-val", async ({ request }) => {
    const response = await request.get(
      "/api/books/non-existent-invalid-id/cover"
    );
    expect(response.status()).toBe(404);
  });
});
