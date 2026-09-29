// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { normalizeFileRefs } from "@/lib/backup/restore-service";

describe("normalizeFileRefs (restore)", () => {
  it("converts legacy MinIO URLs from v1 backups to storage references", () => {
    const book = {
      id: "b1",
      fileUrl: "http://minio:9000/ebooks/u1/2_book.epub",
      originalFileUrl: "http://localhost:9000/ebooks/u1/1_book.pdf",
      coverUrl: "http://minio:9000/covers/u1/1_cover.jpg",
    };
    expect(normalizeFileRefs(book)).toEqual({
      id: "b1",
      fileUrl: "ebooks/u1/2_book.epub",
      originalFileUrl: "ebooks/u1/1_book.pdf",
      coverUrl: "covers/u1/1_cover.jpg",
    });
  });

  it("keeps storage references, nulls and unrecognised values unchanged", () => {
    const book = { fileUrl: "ebooks/u1/a.epub", originalFileUrl: null, coverUrl: "" };
    expect(normalizeFileRefs(book)).toEqual(book);
  });
});
