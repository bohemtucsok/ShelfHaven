// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readdir, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  parseStorageRef,
  resolveStoragePath,
  sanitizeKeySegment,
  saveFile,
  readStoredFile,
  openStoredFile,
  deleteStoredFile,
  listFiles,
} from "@/lib/storage";

let root: string;
const originalDir = process.env.STORAGE_DIR;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "shelfhaven-storage-"));
  process.env.STORAGE_DIR = root;
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  process.env.STORAGE_DIR = originalDir;
});

describe("parseStorageRef", () => {
  it("parses a plain bucket/key reference", () => {
    expect(parseStorageRef("ebooks/u1/123_book.epub")).toEqual({ bucket: "ebooks", key: "u1/123_book.epub" });
  });

  it("parses legacy MinIO URLs with any host", () => {
    expect(parseStorageRef("http://minio:9000/covers/u1/1_cover.jpg")).toEqual({ bucket: "covers", key: "u1/1_cover.jpg" });
    expect(parseStorageRef("http://localhost:9000/ebooks/u1/a b.pdf")).toEqual({ bucket: "ebooks", key: "u1/a b.pdf" });
  });

  it("rejects unknown buckets, traversal and empty values", () => {
    expect(parseStorageRef(null)).toBeNull();
    expect(parseStorageRef("")).toBeNull();
    expect(parseStorageRef("secrets/u1/x")).toBeNull();
    expect(parseStorageRef("ebooks/../covers/x.jpg")).toBeNull();
    expect(parseStorageRef("ebooks/u1/../../etc/passwd")).toBeNull();
    expect(parseStorageRef("ebooks/")).toBeNull();
    expect(parseStorageRef("https://example.com/image.jpg")).toBeNull();
  });
});

describe("resolveStoragePath", () => {
  it("keeps paths inside the bucket directory", () => {
    expect(resolveStoragePath("ebooks", "u1/x.epub")).toBe(path.join(root, "ebooks", "u1", "x.epub"));
    expect(() => resolveStoragePath("ebooks", "../covers/x")).toThrow();
    expect(() => resolveStoragePath("ebooks", "/etc/passwd")).toThrow();
    expect(() => resolveStoragePath("ebooks", "u1\\..\\x")).toThrow();
    expect(() => resolveStoragePath("other", "x")).toThrow();
  });
});

describe("sanitizeKeySegment", () => {
  it("strips directories and unsafe characters", () => {
    expect(sanitizeKeySegment("OEBPS/images/cover image.jpg")).toBe("cover_image.jpg");
    expect(sanitizeKeySegment("../../evil.png")).toBe("evil.png");
    expect(sanitizeKeySegment("..")).toBe("_");
    expect(sanitizeKeySegment("")).toBe("file");
  });
});

describe("file operations", () => {
  it("saves, reads and deletes a file", async () => {
    const ref = await saveFile("ebooks", "u1/1_book.epub", Buffer.from("hello"));
    expect(ref).toBe("ebooks/u1/1_book.epub");

    const read = await readStoredFile(ref);
    expect(read?.data.toString()).toBe("hello");
    expect(read?.contentType).toBe("application/epub+zip");

    await deleteStoredFile(ref);
    expect(await readStoredFile(ref)).toBeNull();
  });

  it("reads files through legacy MinIO URLs", async () => {
    await saveFile("covers", "u1/1_cover.jpg", Buffer.from([1, 2, 3]));
    const read = await readStoredFile("http://minio:9000/covers/u1/1_cover.jpg");
    expect(read?.contentType).toBe("image/jpeg");
    expect([...read!.data]).toEqual([1, 2, 3]);
  });

  it("leaves no temp files behind and overwrites atomically", async () => {
    await saveFile("ebooks", "u1/a.pdf", Buffer.from("v1"));
    await saveFile("ebooks", "u1/a.pdf", Buffer.from("v2"));
    expect(await readdir(path.join(root, "ebooks", "u1"))).toEqual(["a.pdf"]);
    expect((await readStoredFile("ebooks/u1/a.pdf"))?.data.toString()).toBe("v2");
  });

  it("returns null for missing or invalid references", async () => {
    expect(await readStoredFile("ebooks/u1/missing.epub")).toBeNull();
    expect(await readStoredFile("ebooks/../../x")).toBeNull();
    expect(await openStoredFile("covers/u1/missing.jpg")).toBeNull();
    await expect(deleteStoredFile("ebooks/u1/missing.epub")).resolves.toBeUndefined();
  });

  it("refuses to write outside the storage root", async () => {
    await expect(saveFile("ebooks", "../escape.txt", Buffer.from("x"))).rejects.toThrow();
  });

  it("streams a file with its size", async () => {
    await saveFile("ebooks", "u1/big.pdf", Buffer.alloc(70_000, 7));
    const opened = await openStoredFile("ebooks/u1/big.pdf");
    expect(opened?.size).toBe(70_000);
    expect(opened?.contentType).toBe("application/pdf");
    const body = Buffer.from(await new Response(opened!.stream).arrayBuffer());
    expect(body.length).toBe(70_000);
  });

  it("lists files recursively and skips temp files", async () => {
    await saveFile("ebooks", "u1/a.epub", Buffer.from("aa"));
    await saveFile("ebooks", "u2/sub/b.pdf", Buffer.from("bbb"));
    await mkdir(path.join(root, "ebooks", "u1"), { recursive: true });
    await writeFile(path.join(root, "ebooks", "u1", "c.epub.123.tmp"), "x");

    const files = (await listFiles("ebooks")).sort((a, b) => a.key.localeCompare(b.key));
    expect(files).toEqual([
      { key: "u1/a.epub", size: 2 },
      { key: "u2/sub/b.pdf", size: 3 },
    ]);
    expect(await listFiles("covers")).toEqual([]);
  });
});
