// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

const findUnique = vi.fn();
const authMock = vi.fn();

vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));
vi.mock("@/lib/prisma", () => ({ prisma: { book: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => null, DOWNLOAD_LIMIT: {} }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: () => null }));

import { GET } from "@/app/api/books/[id]/download/route";
import { saveFile } from "@/lib/storage";

let root: string;
const originalDir = process.env.STORAGE_DIR;

function get(query = "") {
  return GET(new NextRequest(`http://localhost/api/books/b1/download${query}`), {
    params: Promise.resolve({ id: "b1" }),
  });
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "shelfhaven-dl-"));
  process.env.STORAGE_DIR = root;
  authMock.mockResolvedValue({ user: { id: "u1" } });
  findUnique.mockReset();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  process.env.STORAGE_DIR = originalDir;
});

describe("GET /api/books/[id]/download", () => {
  it("requires a session", async () => {
    authMock.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });

  it("serves the reading copy as EPUB", async () => {
    await saveFile("ebooks", "u1/1_book.epub", Buffer.from("epub-bytes"));
    findUnique.mockResolvedValue({ fileUrl: "ebooks/u1/1_book.epub", originalFileUrl: null });

    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/epub+zip");
    expect(res.headers.get("content-length")).toBe("10");
    expect(res.headers.get("content-disposition")).toBeNull();
    expect(await res.text()).toBe("epub-bytes");
  });

  it("still resolves legacy MinIO URLs stored in the database", async () => {
    await saveFile("ebooks", "u1/1_book.epub", Buffer.from("legacy"));
    findUnique.mockResolvedValue({ fileUrl: "http://minio:9000/ebooks/u1/1_book.epub", originalFileUrl: null });

    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("legacy");
  });

  it("serves the original upload as an attachment", async () => {
    await saveFile("ebooks", "u1/2_book.epub", Buffer.from("converted"));
    await saveFile("ebooks", "u1/1_My_Book.pdf", Buffer.from("%PDF-original"));
    findUnique.mockResolvedValue({ fileUrl: "ebooks/u1/2_book.epub", originalFileUrl: "ebooks/u1/1_My_Book.pdf" });

    const res = await get("?variant=original");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain('filename="My_Book.pdf"');
    expect(await res.text()).toBe("%PDF-original");
  });

  it("falls back to the reading copy when there is no original", async () => {
    await saveFile("ebooks", "u1/1_book.epub", Buffer.from("only-epub"));
    findUnique.mockResolvedValue({ fileUrl: "ebooks/u1/1_book.epub", originalFileUrl: null });

    const res = await get("?variant=original");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain('filename="book.epub"');
    expect(await res.text()).toBe("only-epub");
  });

  it("returns 404 for missing files and unknown books", async () => {
    findUnique.mockResolvedValue({ fileUrl: "ebooks/u1/missing.epub", originalFileUrl: null });
    expect((await get()).status).toBe(404);

    findUnique.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
  });

  it("does not follow path traversal in stored references", async () => {
    findUnique.mockResolvedValue({ fileUrl: "ebooks/../../etc/passwd", originalFileUrl: null });
    expect((await get()).status).toBe(404);
  });
});
