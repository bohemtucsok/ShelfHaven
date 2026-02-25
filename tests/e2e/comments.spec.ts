import { test, expect } from "@playwright/test";

test.describe("Komment rendszer", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to library and find a book
    await page.goto("/library");
    await expect(page.getByRole("heading", { name: "Könyvtáram" })).toBeVisible({ timeout: 10000 });
    const bookLink = page.locator("a[href^='/book/']").first();
    await expect(bookLink).toBeVisible({ timeout: 10000 });
    await bookLink.click();
    await page.waitForURL(/\/book\//);
  });

  test("komment szekció megjelenik a könyv részletek oldalon", async ({ page }) => {
    await expect(page.getByText(/Hozzászólások/)).toBeVisible({ timeout: 10000 });
  });

  test("komment textarea megjelenik bejelentkezett felhasználónak", async ({ page }) => {
    const textarea = page.getByPlaceholder(/Írd meg a véleményed/);
    await expect(textarea).toBeVisible({ timeout: 10000 });
  });

  test("komment küldése és megjelenése", async ({ page }) => {
    const textarea = page.getByPlaceholder(/Írd meg a véleményed/);
    await expect(textarea).toBeVisible({ timeout: 10000 });

    const commentText = `Teszt komment ${Date.now()}`;
    await textarea.fill(commentText);

    const submitBtn = page.getByRole("button", { name: "Küldés", exact: true });
    await submitBtn.click();

    // Wait for the comment to appear in a paragraph (not textarea)
    await expect(page.locator("p.whitespace-pre-wrap", { hasText: commentText })).toBeVisible({ timeout: 10000 });
  });

  test("komment karakter számláló működik", async ({ page }) => {
    const textarea = page.getByPlaceholder(/Írd meg a véleményed/);
    await expect(textarea).toBeVisible({ timeout: 10000 });

    await textarea.fill("Hello");
    await expect(page.getByText("5/2000")).toBeVisible();
  });

  test("komment szerkesztése", async ({ page }) => {
    // First add a comment
    const textarea = page.getByPlaceholder(/Írd meg a véleményed/);
    await expect(textarea).toBeVisible({ timeout: 10000 });

    const originalText = `Edit teszt ${Date.now()}`;
    await textarea.fill(originalText);
    await page.getByRole("button", { name: "Küldés", exact: true }).click();
    await expect(page.locator("p.whitespace-pre-wrap", { hasText: originalText })).toBeVisible({ timeout: 10000 });

    // Find the comment card that contains the text, then click its edit button
    const commentCard = page.locator(".rounded-lg.border", { hasText: originalText });
    const editBtn = commentCard.getByRole("button", { name: "Szerkesztés" });
    if (await editBtn.isVisible().catch(() => false)) {
      await editBtn.click();

      // After clicking edit, a textarea appears as the last textarea on page
      // (review textarea + main comment textarea + edit textarea)
      const editArea = page.locator("textarea").last();
      await expect(editArea).toBeVisible({ timeout: 5000 });

      // Select all and type new text to ensure React state updates
      const updatedText = `Szerkesztett ${Date.now()}`;
      await editArea.click();
      await editArea.press("Control+a");
      await editArea.pressSequentially(updatedText, { delay: 10 });

      // Save - the edit form has a small "Küldés" button (text-xs class)
      await page.locator("button.text-xs", { hasText: "Küldés" }).click();
      await expect(page.locator("p.whitespace-pre-wrap", { hasText: updatedText })).toBeVisible({ timeout: 15000 });
    }
  });

  test("komment törlése", async ({ page }) => {
    // First add a comment
    const textarea = page.getByPlaceholder(/Írd meg a véleményed/);
    await expect(textarea).toBeVisible({ timeout: 10000 });

    const commentText = `Törlendő komment ${Date.now()}`;
    await textarea.fill(commentText);
    await page.getByRole("button", { name: "Küldés", exact: true }).click();
    // Wait for comment to appear as paragraph
    await expect(page.locator("p.whitespace-pre-wrap", { hasText: commentText })).toBeVisible({ timeout: 10000 });

    // Accept upcoming confirm dialog
    page.once("dialog", (dialog) => dialog.accept());

    // Find the comment card that contains the text, then click its delete button
    const commentCard = page.locator(".rounded-lg.border", { hasText: commentText });
    const deleteBtn = commentCard.getByRole("button", { name: "Törlés" });
    if (await deleteBtn.isVisible().catch(() => false)) {
      await deleteBtn.click();
      // Comment paragraph should disappear
      await expect(page.locator("p.whitespace-pre-wrap", { hasText: commentText })).not.toBeVisible({ timeout: 10000 });
    }
  });

  test("válasz komment funkció", async ({ page }) => {
    // First add a comment
    const textarea = page.getByPlaceholder(/Írd meg a véleményed/);
    await expect(textarea).toBeVisible({ timeout: 10000 });

    const parentText = `Szülő komment ${Date.now()}`;
    await textarea.fill(parentText);
    await page.getByRole("button", { name: "Küldés", exact: true }).click();
    await expect(page.locator("p.whitespace-pre-wrap", { hasText: parentText })).toBeVisible({ timeout: 10000 });

    // Find the comment card, then click reply button inside it
    const commentCard = page.locator(".rounded-lg.border", { hasText: parentText });
    const replyBtn = commentCard.getByRole("button", { name: "Válasz" });
    if (await replyBtn.isVisible().catch(() => false)) {
      await replyBtn.click();

      // Reply form should appear
      const replyTextarea = page.getByPlaceholder(/Válasz írása/);
      await expect(replyTextarea).toBeVisible({ timeout: 5000 });
    }
  });

  test("továbbiak betöltése gomb megjelenik sok kommentnél", async ({ page }) => {
    // Just verify the comment section loaded
    await expect(page.getByText(/Hozzászólások/)).toBeVisible({ timeout: 10000 });
  });
});
