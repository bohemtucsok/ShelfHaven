// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const authMock = vi.fn();
const rateLimitMock = vi.fn();
const restoreMock = vi.fn();

vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: (...a: unknown[]) => rateLimitMock(...a) }));
vi.mock("@/lib/backup/restore-service", () => ({
  restoreBackup: (...a: unknown[]) => restoreMock(...a),
}));

import { POST } from "@/app/api/admin/backup/restore/route";
import { getRestoreUploadMaxBytes, RESTORE_UPLOAD_MAX_MB_DEFAULT } from "@/lib/backup/restore-limits";
import { getProgress, completeOperation } from "@/lib/backup/progress-store";

const URL_ = "http://localhost/api/admin/backup/restore";
const MB = 1024 * 1024;
const LIMIT = RESTORE_UPLOAD_MAX_MB_DEFAULT * MB;

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

function backupRequest(name = "backup.zip", mode = "wipe", headers: Record<string, string> = {}) {
  const fd = new FormData();
  fd.append("file", new File([new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...new Array(18).fill(0)])], name));
  fd.append("mode", mode);
  return new NextRequest(URL_, { method: "POST", body: fd, headers });
}

let testTmp: string;
const originalTmpdir = process.env.TMPDIR;

beforeEach(async () => {
  // os.tmpdir() follows TMPDIR, so the route's temp directories land here.
  testTmp = await mkdtemp(path.join(tmpdir(), "shelfhaven-restore-test-"));
  process.env.TMPDIR = testTmp;
  authMock.mockReset().mockResolvedValue({ user: { id: "a1", role: "ADMIN" } });
  rateLimitMock.mockReset().mockReturnValue(null);
  // Like the real service, finish the operation so the next request is not a 409
  restoreMock.mockReset().mockImplementation(async (id: string) => {
    completeOperation(id);
    return { success: true };
  });
  delete process.env.RESTORE_UPLOAD_MAX_MB;
});

afterEach(async () => {
  delete process.env.RESTORE_UPLOAD_MAX_MB;
  if (originalTmpdir === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = originalTmpdir;
  await rm(testTmp, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("POST /api/admin/backup/restore body size limit", () => {
  it("returns 401 without a session and reads 0 bytes", async () => {
    authMock.mockResolvedValue(null);
    const { stream, stats } = countingStream(10 * MB);

    const res = await POST(streamRequest(stream));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(stats.pulled).toBe(0);
    expect(restoreMock).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-admin user and reads 0 bytes", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", role: "USER" } });
    const { stream, stats } = countingStream(10 * MB);

    const res = await POST(streamRequest(stream));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
    expect(stats.pulled).toBe(0);
  });

  it("returns 413 for a declared Content-Length above the limit and reads 0 bytes", async () => {
    const { stream, stats } = countingStream(200 * MB);

    const res = await POST(streamRequest(stream, { "content-length": String(LIMIT + 10 * MB) }));

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({
      error: "Backup file too large (max 100 MB, RESTORE_UPLOAD_MAX_MB)",
      maxMb: 100,
    });
    expect(stats.pulled).toBe(0);
    expect(restoreMock).not.toHaveBeenCalled();
  });

  it("returns 413 and cancels the stream after the limit when Content-Length is missing", async () => {
    const { stream, stats } = countingStream(300 * MB);

    const res = await POST(streamRequest(stream));

    expect(res.status).toBe(413);
    expect(stats.pulled).toBeLessThanOrEqual(LIMIT + 2 * MB);
    expect(stats.cancelled).toBe(true);
    expect(restoreMock).not.toHaveBeenCalled();
  });

  it("returns 413 and cancels the stream after the limit when Content-Length is forged (too small)", async () => {
    const { stream, stats } = countingStream(300 * MB);

    const res = await POST(streamRequest(stream, { "content-length": "1000" }));

    expect(res.status).toBe(413);
    expect(stats.pulled).toBeLessThanOrEqual(LIMIT + 2 * MB);
    expect(stats.cancelled).toBe(true);
  });

  it("honours RESTORE_UPLOAD_MAX_MB", async () => {
    process.env.RESTORE_UPLOAD_MAX_MB = "5";
    const { stream, stats } = countingStream(50 * MB);

    const res = await POST(streamRequest(stream));

    expect(res.status).toBe(413);
    expect((await res.json()).maxMb).toBe(5);
    expect(stats.pulled).toBeLessThanOrEqual(5 * MB + 2 * MB);
  });

  it("starts the restore for a valid small backup exactly as before", async () => {
    const res = await POST(backupRequest("backup.zip", "merge"));

    expect(res.status).toBe(200);
    const { operationId } = await res.json();
    expect(typeof operationId).toBe("string");
    expect(getProgress(operationId)?.type).toBe("restore");
    expect(restoreMock).toHaveBeenCalledTimes(1);
    const [opId, buffer, mode] = restoreMock.mock.calls[0];
    expect(opId).toBe(operationId);
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect((buffer as ArrayBuffer).byteLength).toBe(22);
    expect(mode).toBe("merge");
  });

  it("keeps the existing 400 answers", async () => {
    const r1 = await POST(backupRequest("backup.tar"));
    expect(r1.status).toBe(400);
    expect(await r1.json()).toEqual({ error: "Invalid file type, expected .zip" });

    const r2 = await POST(backupRequest("backup.zip", "everything"));
    expect(r2.status).toBe(400);
    expect(await r2.json()).toEqual({ error: "Invalid mode, expected 'wipe' or 'merge'" });

    const noFile = new FormData();
    noFile.append("mode", "wipe");
    const r3 = await POST(new NextRequest(URL_, { method: "POST", body: noFile }));
    expect(r3.status).toBe(400);
    expect(await r3.json()).toEqual({ error: "No file provided" });
    expect(restoreMock).not.toHaveBeenCalled();
  });

  it("keeps CSRF in front of everything", async () => {
    const res = await POST(backupRequest("backup.zip", "wipe", { origin: "https://evil.example", host: "localhost" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "CSRF validation failed" });
    expect(authMock).not.toHaveBeenCalled();
  });

  it("keeps the rate limit after the admin check", async () => {
    rateLimitMock.mockReturnValue(NextResponse.json({ error: "Too many requests" }, { status: 429 }));
    const res = await POST(backupRequest());
    expect(res.status).toBe(429);
    expect(rateLimitMock).toHaveBeenCalledWith(expect.anything(), "admin-restore", {
      interval: 10 * 60 * 1000,
      maxRequests: 1,
    });
    expect(authMock).toHaveBeenCalled();
    expect(restoreMock).not.toHaveBeenCalled();
  });
});

function zipRequest(content: Uint8Array<ArrayBuffer>, name = "backup.zip", mode = "merge") {
  const fd = new FormData();
  fd.append("mode", mode);
  fd.append("file", new File([content], name));
  return new NextRequest(URL_, { method: "POST", body: fd });
}

describe("POST /api/admin/backup/restore streaming (busboy)", () => {
  it("hands the exact ZIP bytes to restoreBackup and removes the temp file", async () => {
    const zip = new Uint8Array(3 * MB + 5);
    for (let i = 0; i < zip.length; i++) zip[i] = (i * 31) & 0xff;

    const res = await POST(zipRequest(zip));

    expect(res.status).toBe(200);
    const [, buffer, mode] = restoreMock.mock.calls[0];
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(Buffer.from(buffer as ArrayBuffer).equals(Buffer.from(zip))).toBe(true);
    expect(mode).toBe("merge");
    expect(await readdir(testTmp)).toEqual([]);
  });

  it("accepts a ZIP of exactly RESTORE_UPLOAD_MAX_MB", async () => {
    process.env.RESTORE_UPLOAD_MAX_MB = "1";

    const res = await POST(zipRequest(new Uint8Array(MB)));

    expect(res.status).toBe(200);
    expect((restoreMock.mock.calls[0][1] as ArrayBuffer).byteLength).toBe(MB);
  });

  it("answers 413 for a ZIP one byte above the limit and removes the partial file", async () => {
    process.env.RESTORE_UPLOAD_MAX_MB = "1";

    const res = await POST(zipRequest(new Uint8Array(MB + 1)));

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({
      error: "Backup file too large (max 1 MB, RESTORE_UPLOAD_MAX_MB)",
      maxMb: 1,
    });
    expect(restoreMock).not.toHaveBeenCalled();
    expect(await readdir(testTmp)).toEqual([]);
  });

  it("answers 400 for a truncated multipart body and removes the partial file", async () => {
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array(512 * 1024)], "backup.zip"));
    const req = new Request(URL_, { method: "POST", body: fd });
    const bytes = new Uint8Array(await req.arrayBuffer());

    const res = await POST(
      new NextRequest(URL_, {
        method: "POST",
        body: bytes.subarray(0, bytes.length - 100_000),
        headers: { "content-type": req.headers.get("content-type")! },
      })
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid multipart request" });
    expect(restoreMock).not.toHaveBeenCalled();
    expect(await readdir(testTmp)).toEqual([]);
  });

  it("does not write a non-ZIP upload to disk", async () => {
    const res = await POST(zipRequest(new Uint8Array(MB), "backup.tar"));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid file type, expected .zip" });
    expect(await readdir(testTmp)).toEqual([]);
  });
});

describe("getRestoreUploadMaxBytes", () => {
  it("defaults to 100 MB, honours a valid override and ignores an invalid one", () => {
    expect(getRestoreUploadMaxBytes({})).toBe(100 * MB);
    expect(getRestoreUploadMaxBytes({ RESTORE_UPLOAD_MAX_MB: "250" })).toBe(250 * MB);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(getRestoreUploadMaxBytes({ RESTORE_UPLOAD_MAX_MB: "nope" })).toBe(100 * MB);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
