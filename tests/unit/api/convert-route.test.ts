// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

const findUnique = vi.fn();
const update = vi.fn();
const authMock = vi.fn();
const notify = vi.fn();

vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    book: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => update(...a),
    },
  },
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => null, API_LIMIT: {} }));
vi.mock("@/lib/csrf", () => ({ validateCsrf: () => null }));
vi.mock("@/lib/notifications", () => ({
  createNotification: (...a: unknown[]) => {
    notify(...a);
    return Promise.resolve();
  },
}));

// Synthetic traceback shaped like a real Calibre failure; no real host or file data.
const TRACEBACK = [
  "Traceback (most recent call last):",
  '  File "/usr/bin/ebook-convert", line 20, in <module>',
  "    sys.exit(main())",
  '  File "/usr/lib/calibre/calibre/ebooks/pdf/reflow.py", line 700, in find_header_footer',
  "    return pages[0]",
  "IndexError: list index out of range",
].join("\n");

const LEAKS = ["Traceback", 'File "/', "/usr/lib", "/usr/bin"];

let server: Server;
let reply: (req: IncomingMessage, res: ServerResponse) => void;
let root: string;
let POST: typeof import("@/app/api/books/[id]/convert/route").POST;
let GET: typeof import("@/app/api/books/[id]/convert/route").GET;
let saveFile: typeof import("@/lib/storage").saveFile;
const originalDir = process.env.STORAGE_DIR;
const originalUrl = process.env.CALIBRE_SERVICE_URL;

function json(status: number, body: unknown) {
  reply = (_req, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
}

function post() {
  return POST(new NextRequest("http://localhost/api/books/b1/convert", { method: "POST" }), {
    params: Promise.resolve({ id: "b1" }),
  });
}

function get() {
  return GET(new NextRequest("http://localhost/api/books/b1/convert"), {
    params: Promise.resolve({ id: "b1" }),
  });
}

function storedError(): string {
  const failed = update.mock.calls.find(
    ([arg]) => (arg as { data: { conversionStatus?: string } }).data.conversionStatus === "failed"
  );
  return (failed?.[0] as { data: { conversionError: string } }).data.conversionError;
}

function expectNoLeak(text: string) {
  for (const leak of LEAKS) expect(text).not.toContain(leak);
}

beforeAll(async () => {
  server = createServer((req, res) => {
    req.resume();
    req.on("end", () => reply(req, res));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  process.env.CALIBRE_SERVICE_URL = `http://127.0.0.1:${port}`;
  ({ POST, GET } = await import("@/app/api/books/[id]/convert/route"));
  ({ saveFile } = await import("@/lib/storage"));
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  process.env.CALIBRE_SERVICE_URL = originalUrl;
});

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "shelfhaven-convert-"));
  process.env.STORAGE_DIR = root;
  await saveFile("ebooks", "u1/1_sample.pdf", Buffer.from("%PDF-1.4 synthetic"));
  authMock.mockResolvedValue({ user: { id: "u1" } });
  findUnique.mockReset().mockResolvedValue({
    id: "b1",
    fileUrl: "ebooks/u1/1_sample.pdf",
    originalFileUrl: null,
    originalFormat: "pdf",
    conversionStatus: "failed",
    userId: "u1",
    title: "Sample",
  });
  update.mockReset().mockResolvedValue({});
  notify.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
  process.env.STORAGE_DIR = originalDir;
});

describe("POST /api/books/[id]/convert — failure handling", () => {
  it("never leaks a Calibre traceback to the response, notification or database", async () => {
    json(500, { error: TRACEBACK });
    const consoleError = vi.mocked(console.error);

    const res = await post();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: "unsupported_content", code: "unsupported_content" });
    expectNoLeak(JSON.stringify(body));

    expect(notify).toHaveBeenCalledTimes(1);
    const message = (notify.mock.calls[0][0] as { message: string }).message;
    expectNoLeak(message);
    expect(message).toContain("Sample");

    const stored = storedError();
    expectNoLeak(stored);
    expect(stored).toBe("unsupported_content: IndexError: list index out of range");

    // The full detail goes to the server log, tagged with the book id.
    const logged = consoleError.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("b1");
    expect(logged).toContain("Traceback");
  });

  it.each([
    [400, "Empty request body", "unsupported_content"],
    [413, "File too large (max 200MB)", "too_large"],
    [503, "Server busy, too many concurrent conversions", "busy"],
    [500, "Conversion timed out (5 min limit)", "timeout"],
  ])("classifies a short %i error (%s) as %s", async (status, error, code) => {
    json(status, { error });

    const res = await post();

    expect(await res.json()).toEqual({ error: code, code });
    expect(storedError().startsWith(code)).toBe(true);
  });

  it("reports an unreachable service as busy", async () => {
    process.env.CALIBRE_SERVICE_URL = "http://127.0.0.1:1";
    vi.resetModules();
    const mod = await import("@/app/api/books/[id]/convert/route");
    const { port } = server.address() as AddressInfo;
    process.env.CALIBRE_SERVICE_URL = `http://127.0.0.1:${port}`;

    const res = await mod.POST(new NextRequest("http://localhost/api/books/b1/convert", { method: "POST" }), {
      params: Promise.resolve({ id: "b1" }),
    });

    expect(await res.json()).toEqual({ error: "busy", code: "busy" });
  });

  it("does not leak an unexpected exception message", async () => {
    findUnique.mockResolvedValue({
      id: "b1",
      fileUrl: "ebooks/u1/missing.pdf",
      originalFileUrl: null,
      originalFormat: "pdf",
      conversionStatus: "failed",
      userId: "u1",
      title: "Sample",
    });

    const res = await post();

    expect(await res.json()).toEqual({ error: "unknown", code: "unknown" });
    expect(storedError().startsWith("unknown")).toBe(true);
  });
});

describe("GET /api/books/[id]/convert", () => {
  it("returns only the error code, also for raw legacy values", async () => {
    findUnique.mockResolvedValue({ conversionStatus: "failed", conversionError: TRACEBACK });

    const body = await (await get()).json();

    expect(body).toEqual({ conversionStatus: "failed", conversionError: "unsupported_content" });
  });

  it("strips the stored summary", async () => {
    findUnique.mockResolvedValue({
      conversionStatus: "failed",
      conversionError: "timeout: Conversion timed out (5 min limit)",
    });

    expect((await (await get()).json()).conversionError).toBe("timeout");
  });
});
