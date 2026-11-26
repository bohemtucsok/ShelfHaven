// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

type Received = { file: Buffer; filename: string } | null;

let server: Server;
let dir: string;
let received: Received;
let reply: (req: IncomingMessage, res: ServerResponse) => void;
let convertToEpub: typeof import("@/lib/ebook/calibre").convertToEpub;

async function readMultipart(req: IncomingMessage): Promise<Received> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const form = await new Response(Buffer.concat(chunks), {
    headers: { "content-type": req.headers["content-type"] ?? "" },
  }).formData();
  const file = form.get("file") as File;
  return { file: Buffer.from(await file.arrayBuffer()), filename: file.name };
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    received = await readMultipart(req);
    reply(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  process.env.CALIBRE_SERVICE_URL = `http://127.0.0.1:${port}`;
  ({ convertToEpub } = await import("@/lib/ebook/calibre"));
  dir = await mkdtemp(path.join(tmpdir(), "shelfhaven-calibre-"));
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
});

beforeEach(() => {
  received = null;
  reply = (_req, res) => {
    res.writeHead(200, { "content-type": "application/epub+zip" });
    res.end("EPUB-BYTES");
  };
});

describe("convertToEpub", () => {
  it("streams the file from disk with a sanitized name and returns the converted bytes", async () => {
    const content = randomBytes(3 * 1024 * 1024 + 7);
    const filePath = path.join(dir, "source.pdf");
    await writeFile(filePath, content);

    const result = await convertToEpub(filePath, "dir/sub\\evil name;rm.pdf");

    expect(result).toEqual({ success: true, data: Buffer.from("EPUB-BYTES") });
    expect(received?.filename).toBe("evil_name_rm.pdf");
    expect(received?.file.equals(content)).toBe(true);
  });

  it("reports a missing source file without calling the service", async () => {
    const result = await convertToEpub(path.join(dir, "missing.pdf"), "missing.pdf");

    expect(result).toEqual({ success: false, code: "unknown", error: "Failed to read file from storage" });
    expect(received).toBeNull();
  });

  it("keeps the service error as detail and classifies it", async () => {
    const filePath = path.join(dir, "bad.mobi");
    await writeFile(filePath, "not really a mobi");
    reply = (_req, res) => {
      res.writeHead(422, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Unsupported input" }));
    };

    const result = await convertToEpub(filePath, "bad.mobi");

    expect(result).toEqual({ success: false, code: "unsupported_content", error: "Unsupported input" });
  });

  it.each([
    [400, "Empty request body", "unsupported_content"],
    [413, "File too large (max 200MB)", "too_large"],
    [503, "Server busy, too many concurrent conversions", "busy"],
    [500, "Conversion timed out (5 min limit)", "timeout"],
    [500, "IndexError: list index out of range", "unsupported_content"],
    [502, "Bad gateway", "unknown"],
  ])("classifies a %i response (%s) as %s", async (status, error, code) => {
    const filePath = path.join(dir, "short.pdf");
    await writeFile(filePath, "pdf");
    reply = (_req, res) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ error }));
    };

    expect(await convertToEpub(filePath, "short.pdf")).toMatchObject({ success: false, code });
  });

  it("prefers the code sent by the service", async () => {
    const filePath = path.join(dir, "coded.pdf");
    await writeFile(filePath, "pdf");
    reply = (_req, res) => {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "whatever", code: "timeout" }));
    };

    expect(await convertToEpub(filePath, "coded.pdf")).toMatchObject({ code: "timeout" });
  });

  it("ignores an unknown code sent by the service", async () => {
    const filePath = path.join(dir, "badcode.pdf");
    await writeFile(filePath, "pdf");
    reply = (_req, res) => {
      res.writeHead(413, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "big", code: "<script>" }));
    };

    expect(await convertToEpub(filePath, "badcode.pdf")).toMatchObject({ code: "too_large" });
  });
});
