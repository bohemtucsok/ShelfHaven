// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import JSZip from "jszip";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

const authMock = vi.fn();
const rateLimitMock = vi.fn();
const bookCreate = vi.fn();
const saveFileMock = vi.fn();
const activityMock = vi.fn();
const securityLogMock = vi.fn();
const parseEpubSpy = vi.fn();

vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => rateLimitMock(...a),
  UPLOAD_LIMIT: { interval: 3_600_000, maxRequests: 50 },
}));
vi.mock("@/lib/prisma", () => ({ prisma: { book: { create: (...a: unknown[]) => bookCreate(...a) } } }));
vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage")>();
  return { ...actual, saveFile: (...a: unknown[]) => saveFileMock(...a) };
});
vi.mock("@/lib/ebook/epub-parser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ebook/epub-parser")>();
  return {
    ...actual,
    parseEpub: (...a: Parameters<typeof actual.parseEpub>) => {
      parseEpubSpy(...a);
      return actual.parseEpub(...a);
    },
  };
});
vi.mock("@/lib/ebook/cover-utils", () => ({
  downloadAndResizeCover: vi.fn(async () => null),
  generateBlurHash: vi.fn(async () => "BLURHASH"),
}));
vi.mock("@/lib/activity", () => ({ createActivity: (...a: unknown[]) => activityMock(...a) }));
vi.mock("@/lib/security-logger", () => ({ logSecurityEvent: (...a: unknown[]) => securityLogMock(...a) }));

import { POST } from "@/app/api/books/upload/route";
import { MAX_UPLOAD_FILE_SIZE } from "@/lib/upload-limits";

const URL_ = "http://localhost/api/books/upload";
const MB = 1024 * 1024;

const TINY_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

let smallEpubCache: Promise<Buffer> | null = null;

/** The same EPUB bytes on every call (JSZip stamps entry dates). */
function smallEpub(): Promise<Buffer> {
  smallEpubCache ??= buildSmallEpub();
  return smallEpubCache;
}

async function buildSmallEpub(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file(
    "META-INF/container.xml",
    '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>'
  );
  zip.file(
    "OEBPS/content.opf",
    `<package><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title>Kis Könyv</dc:title><dc:creator>Teszt Szerző</dc:creator>
      <meta name="cover" content="cover-image"/></metadata>
      <manifest><item id="cover-image" href="cover.png" media-type="image/png"/></manifest></package>`
  );
  zip.file("OEBPS/cover.png", TINY_PNG);
  return zip.generateAsync({ type: "nodebuffer" });
}

async function multipartRequest(fields: Record<string, string> = {}, headers: Record<string, string> = {}) {
  const fd = new FormData();
  fd.append("file", new File([new Uint8Array(await smallEpub())], "kis konyv.epub"));
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return new NextRequest(URL_, { method: "POST", body: fd, headers });
}

/** A body stream that counts how many bytes the server actually pulled. */
function countingStream(totalBytes: number, chunkBytes = MB) {
  const chunk = new Uint8Array(chunkBytes);
  const stats = { pulled: 0, cancelled: false };
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (stats.pulled >= totalBytes) {
          controller.close();
          return;
        }
        stats.pulled += chunk.byteLength;
        controller.enqueue(chunk);
      },
      cancel() {
        stats.cancelled = true;
      },
    },
    { highWaterMark: 0 }
  );
  return { stream, stats };
}

function streamRequest(stream: ReadableStream<Uint8Array>, headers: Record<string, string> = {}) {
  return new NextRequest(URL_, {
    method: "POST",
    body: stream,
    headers: { "content-type": "multipart/form-data; boundary=x", ...headers },
    duplex: "half", // required by undici for streamed request bodies
  });
}

let storageRoot: string;
const originalStorageDir = process.env.STORAGE_DIR;

/** Every file left in the storage directory (relative paths), temp files included. */
async function storageFiles(): Promise<string[]> {
  const entries = await readdir(storageRoot, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => path.relative(storageRoot, path.join(e.parentPath, e.name)))
    .sort();
}

afterEach(async () => {
  await rm(storageRoot, { recursive: true, force: true });
  process.env.STORAGE_DIR = originalStorageDir;
});

beforeEach(async () => {
  storageRoot = await mkdtemp(path.join(tmpdir(), "shelfhaven-upload-"));
  process.env.STORAGE_DIR = storageRoot;
  parseEpubSpy.mockReset();
  authMock.mockReset().mockResolvedValue({ user: { id: "u1" } });
  rateLimitMock.mockReset().mockReturnValue(null);
  bookCreate.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "book1",
    ...data,
    categories: [],
    topics: [],
  }));
  saveFileMock.mockReset().mockImplementation(async (bucket: string, key: string) => `${bucket}/${key}`);
  activityMock.mockReset().mockResolvedValue(undefined);
  securityLogMock.mockReset();
  vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
});

describe("POST /api/books/upload body size limit", () => {
  it("returns 401 without a session and reads 0 bytes of the body", async () => {
    authMock.mockResolvedValue(null);
    const { stream, stats } = countingStream(10 * MB);

    const res = await POST(streamRequest(stream));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(stats.pulled).toBe(0);
    expect(bookCreate).not.toHaveBeenCalled();
  });

  it("returns 413 for a declared Content-Length above the limit and reads 0 bytes", async () => {
    const { stream, stats } = countingStream(200 * MB);

    const res = await POST(
      streamRequest(stream, { "content-length": String(MAX_UPLOAD_FILE_SIZE + 10 * MB) })
    );

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "A kérés mérete meghaladja a 100MB limitet" });
    expect(stats.pulled).toBe(0);
    expect(saveFileMock).not.toHaveBeenCalled();
    expect(bookCreate).not.toHaveBeenCalled();
  });

  it("returns 413 and cancels the stream after the limit when Content-Length is missing", async () => {
    const { stream, stats } = countingStream(300 * MB);

    const res = await POST(streamRequest(stream));

    expect(res.status).toBe(413);
    expect(stats.pulled).toBeLessThanOrEqual(MAX_UPLOAD_FILE_SIZE + 2 * MB);
    expect(stats.cancelled).toBe(true);
    expect(saveFileMock).not.toHaveBeenCalled();
    expect(bookCreate).not.toHaveBeenCalled();
  });

  it("returns 413 and cancels the stream after the limit when Content-Length is forged (too small)", async () => {
    const { stream, stats } = countingStream(300 * MB);

    const res = await POST(streamRequest(stream, { "content-length": "1000" }));

    expect(res.status).toBe(413);
    expect(stats.pulled).toBeLessThanOrEqual(MAX_UPLOAD_FILE_SIZE + 2 * MB);
    expect(stats.cancelled).toBe(true);
    expect(bookCreate).not.toHaveBeenCalled();
  });

  it("returns 413 (not 400) for a file just above 100 MB that fits the body allowance", async () => {
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array(MAX_UPLOAD_FILE_SIZE + 1)], "nagy.epub"));

    const res = await POST(new NextRequest(URL_, { method: "POST", body: fd }));

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "A fájl mérete meghaladja a 100MB limitet" });
    expect(saveFileMock).not.toHaveBeenCalled();
    expect(bookCreate).not.toHaveBeenCalled();
  });

  it("uploads a valid small EPUB with the same response and side effects as before", async () => {
    const res = await POST(await multipartRequest({ categoryIds: JSON.stringify(["c1"]), topicIds: "t1" }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      id: "book1",
      title: "Kis Könyv",
      author: "Teszt Szerző",
      originalFormat: "epub",
      conversionStatus: "none",
      blurHash: "BLURHASH",
      userId: "u1",
      fileUrl: "/api/books/book1/download",
      coverUrl: "/api/books/book1/cover",
    });

    // Stored ebook (streamed to a temp file, renamed to its key; no temp file left) ...
    expect(await storageFiles()).toEqual([path.join("ebooks", "u1", "1700000000000_kis_konyv.epub")]);
    const stored = await readFile(path.join(storageRoot, "ebooks", "u1", "1700000000000_kis_konyv.epub"));
    expect(stored.equals(await smallEpub())).toBe(true);
    expect(parseEpubSpy).toHaveBeenCalledTimes(1);
    // ... and the EPUB cover
    expect(saveFileMock).toHaveBeenCalledTimes(1);
    expect(saveFileMock.mock.calls[0].slice(0, 2)).toEqual(["covers", "u1/1700000000000_cover_cover.png"]);
    expect(Buffer.from(saveFileMock.mock.calls[0][2]).equals(TINY_PNG)).toBe(true);

    // DB row
    expect(bookCreate).toHaveBeenCalledTimes(1);
    const { data } = bookCreate.mock.calls[0][0];
    expect(data).toMatchObject({
      title: "Kis Könyv",
      author: "Teszt Szerző",
      description: null,
      fileUrl: "ebooks/u1/1700000000000_kis_konyv.epub",
      coverUrl: "covers/u1/1700000000000_cover_cover.png",
      originalFormat: "epub",
      userId: "u1",
      blurHash: "BLURHASH",
      conversionStatus: "none",
      categories: { create: [{ categoryId: "c1" }] },
      topics: { create: [{ topicId: "t1" }] },
    });
    expect(data.fileSize).toBe(stored.length);

    expect(securityLogMock).toHaveBeenCalledWith("UPLOAD_SUCCESS", expect.objectContaining({ userId: "u1" }));
    expect(activityMock).toHaveBeenCalledWith({ userId: "u1", type: "book_upload", bookId: "book1" });
  });

  it("keeps the existing 400 answers unchanged", async () => {
    const noFile = new FormData();
    noFile.append("title", "x");
    const r1 = await POST(new NextRequest(URL_, { method: "POST", body: noFile }));
    expect(r1.status).toBe(400);
    expect(await r1.json()).toEqual({ error: "Nincs fájl csatolva" });

    const badExt = new FormData();
    badExt.append("file", new File(["x"], "konyv.exe"));
    const r2 = await POST(new NextRequest(URL_, { method: "POST", body: badExt }));
    expect(r2.status).toBe(400);
    expect((await r2.json()).error).toMatch(/^Nem támogatott formátum: exe/);

    const badMagic = new FormData();
    badMagic.append("file", new File(["not a zip"], "konyv.epub"));
    const r3 = await POST(new NextRequest(URL_, { method: "POST", body: badMagic }));
    expect(r3.status).toBe(400);
    expect(await r3.json()).toEqual({ error: "A fájl tartalma nem egyezik a kiterjesztéssel" });
  });

  it("keeps CSRF and rate limit in front of auth", async () => {
    const csrf = await POST(await multipartRequest({}, { origin: "https://evil.example", host: "localhost" }));
    expect(csrf.status).toBe(403);
    expect(authMock).not.toHaveBeenCalled();

    rateLimitMock.mockReturnValue(NextResponse.json({ error: "Too many requests" }, { status: 429 }));
    const limited = await POST(await multipartRequest());
    expect(limited.status).toBe(429);
    expect(rateLimitMock).toHaveBeenCalledWith(expect.anything(), "upload", {
      interval: 3_600_000,
      maxRequests: 50,
    });
    expect(authMock).not.toHaveBeenCalled();
  });
});

function fileRequest(content: Uint8Array<ArrayBuffer> | string, filename: string, fields: Record<string, string> = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  fd.append("file", new File([content], filename));
  return new NextRequest(URL_, { method: "POST", body: fd });
}

/** The raw multipart bytes and content type undici produces for a FormData. */
async function serialize(fd: FormData) {
  const req = new Request(URL_, { method: "POST", body: fd });
  return { bytes: new Uint8Array(await req.arrayBuffer()), contentType: req.headers.get("content-type")! };
}

describe("POST /api/books/upload streaming (busboy)", () => {
  it("stores a non-EPUB file without reading it back and starts the conversion", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
    const pdf = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(2 * MB, 7)]);

    const res = await POST(fileRequest(pdf, "Könyv (1).pdf", { title: "Árvíztűrő" }));

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ title: "Árvíztűrő", originalFormat: "pdf", conversionStatus: "pending" });
    const key = path.join("ebooks", "u1", "1700000000000_K_nyv__1_.pdf");
    expect(await storageFiles()).toEqual([key]);
    expect((await readFile(path.join(storageRoot, key))).equals(pdf)).toBe(true);
    expect(parseEpubSpy).not.toHaveBeenCalled();
    expect(bookCreate.mock.calls[0][0].data).toMatchObject({ fileSize: pdf.length, fileUrl: `ebooks/u1/1700000000000_K_nyv__1_.pdf` });
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3000/api/books/book1/convert", expect.anything());
    fetchMock.mockRestore();
  });

  it("accepts a file of exactly the size limit", async () => {
    const pdf = new Uint8Array(MAX_UPLOAD_FILE_SIZE);
    pdf.set(Buffer.from("%PDF"));
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));

    const res = await POST(fileRequest(pdf, "max.pdf"));

    expect(res.status).toBe(201);
    expect(bookCreate.mock.calls[0][0].data.fileSize).toBe(MAX_UPLOAD_FILE_SIZE);
    fetchMock.mockRestore();
  });

  it("removes the partial temp file when the file limit is exceeded (413)", async () => {
    const res = await POST(fileRequest(new Uint8Array(MAX_UPLOAD_FILE_SIZE + 1), "nagy.pdf"));

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "A fájl mérete meghaladja a 100MB limitet" });
    expect(await storageFiles()).toEqual([]);
    expect(bookCreate).not.toHaveBeenCalled();
  });

  it("removes the temp file when the content does not match the extension (400)", async () => {
    const res = await POST(fileRequest("definitely not a pdf", "konyv.pdf"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "A fájl tartalma nem egyezik a kiterjesztéssel" });
    expect(await storageFiles()).toEqual([]);
  });

  it("does not write an unsupported file to disk at all", async () => {
    const res = await POST(fileRequest(new Uint8Array(MB), "virus.exe"));

    expect(res.status).toBe(400);
    expect(await storageFiles()).toEqual([]);
  });

  it("removes the temp file and answers 400 for a truncated multipart body", async () => {
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array(512 * 1024).fill(0x25)], "konyv.pdf"));
    const { bytes, contentType } = await serialize(fd);
    const truncated = bytes.subarray(0, bytes.length - 100_000);

    const res = await POST(
      new NextRequest(URL_, { method: "POST", body: truncated, headers: { "content-type": contentType } })
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Hibás feltöltési kérés" });
    expect(await storageFiles()).toEqual([]);
    expect(bookCreate).not.toHaveBeenCalled();
  });

  it("answers 400 for a body that is not multipart/form-data", async () => {
    const res = await POST(
      new NextRequest(URL_, { method: "POST", body: "{}", headers: { "content-type": "application/json" } })
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Hibás feltöltési kérés" });
    expect(await storageFiles()).toEqual([]);
  });

  it("answers 413 for too many fields or an oversized field and cleans up", async () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 250; i++) many[`f${i}`] = "x";
    const r1 = await POST(fileRequest("%PDF-1.7", "a.pdf", many));
    expect(r1.status).toBe(413);
    expect(await r1.json()).toEqual({ error: "A kérés mérete meghaladja a 100MB limitet" });

    const r2 = await POST(fileRequest("%PDF-1.7", "a.pdf", { description: "x".repeat(70 * 1024) }));
    expect(r2.status).toBe(413);

    expect(await storageFiles()).toEqual([]);
    expect(bookCreate).not.toHaveBeenCalled();
  });

  it("uses only the first file part and keeps repeated topicIds", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
    const fd = new FormData();
    fd.append("topicIds", "t1");
    fd.append("file", new File(["%PDF-first"], "first.pdf"));
    fd.append("topicIds", "t2");
    fd.append("file", new File(["%PDF-second"], "second.pdf"));

    const res = await POST(new NextRequest(URL_, { method: "POST", body: fd }));

    expect(res.status).toBe(201);
    expect(await storageFiles()).toEqual([path.join("ebooks", "u1", "1700000000000_first.pdf")]);
    expect(bookCreate.mock.calls[0][0].data.topics).toEqual({ create: [{ topicId: "t1" }, { topicId: "t2" }] });
    fetchMock.mockRestore();
  });
});
