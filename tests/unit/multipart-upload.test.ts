// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  receiveMultipart,
  MultipartFormatError,
  MultipartLimitError,
  type MultipartLimits,
} from "@/lib/multipart-upload";

const MB = 1024 * 1024;
const LIMITS: MultipartLimits = { fileSize: 100 * MB, fields: 100, fieldSize: 64 * 1024, parts: 101, headerPairs: 8 };

let dir: string;
let tmpPath: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "shelfhaven-multipart-"));
  tmpPath = path.join(dir, "upload.tmp");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Deterministic pseudo-random numbers in [0, 1). */
function lcg(seed: number) {
  return () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
}

/** Re-deliver `bytes` in random chunks of 1..maxChunk bytes. */
function rechunk(bytes: Uint8Array, rnd: () => number, maxChunk = 5000) {
  let pos = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pos >= bytes.length) return controller.close();
      const n = Math.max(1, Math.floor(rnd() * maxChunk));
      controller.enqueue(bytes.slice(pos, pos + n));
      pos += n;
    },
  });
}

/** The raw multipart bytes and content type undici produces for a FormData. */
async function serialize(fd: FormData) {
  const req = new Request("http://localhost/", { method: "POST", body: fd });
  return { bytes: new Uint8Array(await req.arrayBuffer()), contentType: req.headers.get("content-type")! };
}

describe("receiveMultipart", () => {
  it("matches undici's serialization for random chunkings", async () => {
    const fileBytes = new Uint8Array(300_000);
    const r0 = lcg(7);
    for (let i = 0; i < fileBytes.length; i++) fileBytes[i] = Math.floor(r0() * 256);
    // Sprinkle boundary-like sequences into the file content.
    const evil = new TextEncoder().encode("\r\n--\r\n----\r\n--formdata-undici-0");
    for (let k = 0; k < 50; k++) fileBytes.set(evil, Math.floor(r0() * (fileBytes.length - evil.length)));

    const fd = new FormData();
    fd.append("title", 'Árvíztűrő tükörfúrógép – "idézet"');
    fd.append("topicIds", "t1");
    fd.append("topicIds", "t2");
    fd.append("file", new File([fileBytes], "könyv név.epub", { type: "application/epub+zip" }));
    fd.append("after", "x");
    const { bytes, contentType } = await serialize(fd);

    for (let seed = 1; seed <= 200; seed++) {
      const res = await receiveMultipart(rechunk(bytes, lcg(seed), seed % 4 === 0 ? 8 : 5000), {
        contentType,
        fileField: "file",
        tmpPath,
        limits: LIMITS,
      });
      expect(res.fields.get("title")).toEqual(['Árvíztűrő tükörfúrógép – "idézet"']);
      expect(res.fields.get("topicIds")).toEqual(["t1", "t2"]);
      expect(res.fields.get("after")).toEqual(["x"]);
      expect(res.file).toMatchObject({
        filename: "könyv név.epub",
        mimeType: "application/epub+zip",
        size: fileBytes.length,
        path: tmpPath,
      });
      expect(res.file!.head.equals(Buffer.from(fileBytes.subarray(0, 256)))).toBe(true);
      expect(Buffer.from(await readFile(tmpPath)).equals(Buffer.from(fileBytes))).toBe(true);
      await rm(tmpPath);
    }
  }, 120_000);

  it("rejects a file above the limit while streaming and removes the partial file", async () => {
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array(3 * MB)], "a.epub"));
    const { bytes, contentType } = await serialize(fd);

    const err = await receiveMultipart(rechunk(bytes, lcg(3)), {
      contentType,
      fileField: "file",
      tmpPath,
      limits: { ...LIMITS, fileSize: MB },
    }).catch((e) => e);

    expect(err).toBeInstanceOf(MultipartLimitError);
    expect(err.kind).toBe("file");
    expect(await readdir(dir)).toEqual([]);
  });

  it("accepts a file of exactly the limit", async () => {
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array(MB).fill(1)], "a.pdf"));
    const { bytes, contentType } = await serialize(fd);

    const res = await receiveMultipart(rechunk(bytes, lcg(5)), {
      contentType,
      fileField: "file",
      tmpPath,
      limits: { ...LIMITS, fileSize: MB },
    });

    expect(res.file?.size).toBe(MB);
    expect((await readFile(tmpPath)).length).toBe(MB);
  });

  it("only counts a file that is not accepted, without writing it", async () => {
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array(MB).fill(9)], "virus.exe"));
    const { bytes, contentType } = await serialize(fd);

    const res = await receiveMultipart(rechunk(bytes, lcg(9)), {
      contentType,
      fileField: "file",
      tmpPath,
      acceptFile: (name) => name.endsWith(".pdf"),
      limits: LIMITS,
    });

    expect(res.file).toMatchObject({ filename: "virus.exe", size: MB, path: null });
    expect(await readdir(dir)).toEqual([]);
  });

  it.each([
    ["too many fields", { fields: 2 }, () => ["a", "b", "c"].map((k) => [k, "1"] as const)],
    ["an oversized field", { fieldSize: 10 }, () => [["description", "x".repeat(11)] as const]],
    ["too many parts", { parts: 2 }, () => ["a", "b", "c"].map((k) => [k, "1"] as const)],
  ])("rejects %s with a request limit error and cleans up", async (_name, limits, fields) => {
    const fd = new FormData();
    fd.append("file", new File(["%PDF-1.7"], "a.pdf"));
    for (const [k, v] of fields()) fd.append(k, v);
    const { bytes, contentType } = await serialize(fd);

    const err = await receiveMultipart(rechunk(bytes, lcg(11)), {
      contentType,
      fileField: "file",
      tmpPath,
      limits: { ...LIMITS, ...limits },
    }).catch((e) => e);

    expect(err).toBeInstanceOf(MultipartLimitError);
    expect(err.kind).toBe("request");
    expect(await readdir(dir)).toEqual([]);
  });

  it("rejects a truncated body as a format error and removes the partial file", async () => {
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array(200_000).fill(3)], "a.pdf"));
    const { bytes, contentType } = await serialize(fd);

    const err = await receiveMultipart(rechunk(bytes.subarray(0, 150_000), lcg(13)), {
      contentType,
      fileField: "file",
      tmpPath,
      limits: LIMITS,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(MultipartFormatError);
    expect(await readdir(dir)).toEqual([]);
  });

  it("rejects a missing boundary or a non-multipart content type as a format error", async () => {
    for (const contentType of ["multipart/form-data", "application/json", ""]) {
      const err = await receiveMultipart(rechunk(new Uint8Array(10), lcg(1)), {
        contentType,
        fileField: "file",
        tmpPath,
        limits: LIMITS,
      }).catch((e) => e);
      expect(err).toBeInstanceOf(MultipartFormatError);
    }
    await expect(
      receiveMultipart(null, { contentType: "multipart/form-data; boundary=x", fileField: "file", tmpPath, limits: LIMITS })
    ).rejects.toBeInstanceOf(MultipartFormatError);
    expect(await readdir(dir)).toEqual([]);
  });

  it("removes the partial file when the source stream fails", async () => {
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array(200_000).fill(4)], "a.pdf"));
    const { bytes, contentType } = await serialize(fd);
    let sent = 0;
    const failing = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= 100_000) return controller.error(new Error("connection reset"));
        controller.enqueue(bytes.slice(sent, sent + 10_000));
        sent += 10_000;
      },
    });

    const err = await receiveMultipart(failing, { contentType, fileField: "file", tmpPath, limits: LIMITS }).catch(
      (e) => e
    );

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("connection reset");
    expect(await readdir(dir)).toEqual([]);
  });
});
