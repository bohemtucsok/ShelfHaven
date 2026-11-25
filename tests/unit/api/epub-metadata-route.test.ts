// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";

const authMock = vi.fn();
const rateLimitMock = vi.fn();

vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => rateLimitMock(...a),
  API_LIMIT: { interval: 60_000, maxRequests: 60 },
}));
vi.mock("@/lib/ebook/epub-parser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ebook/epub-parser")>();
  return { ...actual, parseEpub: vi.fn(actual.parseEpub) };
});

import { POST } from "@/app/api/books/epub-metadata/route";
import { parseEpub } from "@/lib/ebook/epub-parser";
import { MAX_UPLOAD_FILE_SIZE } from "@/lib/upload-limits";

const URL_ = "http://localhost/api/books/epub-metadata";
const MB = 1024 * 1024;

const TINY_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

async function smallEpub(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file(
    "META-INF/container.xml",
    '<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>'
  );
  zip.file(
    "OEBPS/content.opf",
    `<package><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title>Kis Könyv</dc:title><dc:creator>Teszt Szerző</dc:creator><dc:language>hu</dc:language>
      <meta name="cover" content="cover-image"/></metadata>
      <manifest><item id="cover-image" href="cover.png" media-type="image/png"/></manifest></package>`
  );
  zip.file("OEBPS/cover.png", TINY_PNG);
  return zip.generateAsync({ type: "nodebuffer" });
}

async function multipartRequest(headers: Record<string, string> = {}) {
  const fd = new FormData();
  fd.append("file", new File([new Uint8Array(await smallEpub())], "konyv.epub"));
  return new NextRequest(URL_, { method: "POST", body: fd, headers });
}

/** A body stream that counts how many bytes the server actually pulled. */
function countingStream(totalBytes: number, chunkBytes = MB) {
  const chunk = new Uint8Array(chunkBytes);
  const stats = { pulled: 0, pulls: 0, cancelled: false };
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        stats.pulls++;
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

beforeEach(() => {
  authMock.mockReset().mockResolvedValue({ user: { id: "u1" } });
  rateLimitMock.mockReset().mockReturnValue(null);
  vi.mocked(parseEpub).mockClear();
});

describe("POST /api/books/epub-metadata", () => {
  it("returns 401 without a session and never parses the file", async () => {
    authMock.mockResolvedValue(null);

    const res = await POST(await multipartRequest());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(parseEpub).not.toHaveBeenCalled();
  });

  it("returns 401 for a session without a user id", async () => {
    authMock.mockResolvedValue({ user: {} });
    expect((await POST(await multipartRequest())).status).toBe(401);
    expect(parseEpub).not.toHaveBeenCalled();
  });

  it("returns the same metadata as before for a valid small EPUB with a session", async () => {
    const res = await POST(await multipartRequest());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      title: "Kis Könyv",
      author: "Teszt Szerző",
      description: null,
      language: "hu",
      coverPreview: `data:image/png;base64,${TINY_PNG.toString("base64")}`,
    });
    expect(parseEpub).toHaveBeenCalledTimes(1);
  });

  it("still rejects non-EPUB files with 400", async () => {
    const fd = new FormData();
    fd.append("file", new File(["x"], "konyv.pdf"));
    const res = await POST(new NextRequest(URL_, { method: "POST", body: fd }));
    expect(res.status).toBe(400);
  });

  it("returns 413 for a declared Content-Length above 100 MB without reading the body", async () => {
    const { stream, stats } = countingStream(200 * MB);
    const req = streamRequest(stream, { "content-length": String(MAX_UPLOAD_FILE_SIZE + 10 * MB) });

    const res = await POST(req);

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "A fájl mérete meghaladja a 100MB limitet" });
    expect(stats.pulled).toBe(0);
    expect(parseEpub).not.toHaveBeenCalled();
  });

  it("returns 413 and stops reading when Content-Length is missing", async () => {
    const { stream, stats } = countingStream(300 * MB);

    const res = await POST(streamRequest(stream));

    expect(res.status).toBe(413);
    // Stops right after crossing the limit: at most one chunk over 100 MB + overhead
    expect(stats.pulled).toBeLessThanOrEqual(MAX_UPLOAD_FILE_SIZE + 2 * MB);
    expect(stats.pulled).toBeLessThan(300 * MB);
    expect(stats.cancelled).toBe(true);
    expect(parseEpub).not.toHaveBeenCalled();
  });

  it("returns 413 and stops reading when Content-Length is forged (too small)", async () => {
    const { stream, stats } = countingStream(300 * MB);

    const res = await POST(streamRequest(stream, { "content-length": "1000" }));

    expect(res.status).toBe(413);
    expect(stats.pulled).toBeLessThanOrEqual(MAX_UPLOAD_FILE_SIZE + 2 * MB);
    expect(stats.cancelled).toBe(true);
    expect(parseEpub).not.toHaveBeenCalled();
  });

  it("keeps CSRF protection: a foreign Origin gets 403 before auth", async () => {
    const res = await POST(
      await multipartRequest({ origin: "https://evil.example", host: "localhost" })
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "CSRF validation failed" });
    expect(authMock).not.toHaveBeenCalled();
    expect(parseEpub).not.toHaveBeenCalled();
  });

  it("keeps the rate limit: same key and limit, its response is returned before auth", async () => {
    rateLimitMock.mockReturnValue(NextResponse.json({ error: "Too many requests" }, { status: 429 }));

    const res = await POST(await multipartRequest());

    expect(res.status).toBe(429);
    expect(rateLimitMock).toHaveBeenCalledWith(expect.anything(), "epub-metadata", {
      interval: 60_000,
      maxRequests: 60,
    });
    expect(authMock).not.toHaveBeenCalled();
    expect(parseEpub).not.toHaveBeenCalled();
  });
});
