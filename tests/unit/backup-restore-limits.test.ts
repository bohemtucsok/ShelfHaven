// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import JSZip from "jszip";

// Every prisma call is recorded, so a test can prove nothing was wiped/written.
const dbOps = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/prisma", () => {
  const model = (name: string) => ({
    deleteMany: async () => {
      dbOps.push(`${name}.deleteMany`);
      return { count: 0 };
    },
    createMany: async ({ data }: { data: unknown[] }) => {
      dbOps.push(`${name}.createMany`);
      return { count: data.length };
    },
    create: async () => {
      dbOps.push(`${name}.create`);
      return {};
    },
  });
  const prisma = new Proxy(
    {},
    {
      get: (_, prop: string) =>
        prop.startsWith("$")
          ? async () => {
              dbOps.push(prop);
              return 1;
            }
          : model(prop),
    }
  );
  return { prisma };
});

const saved = vi.hoisted(() => [] as { bucket: string; key: string; data: Uint8Array }[]);
vi.mock("@/lib/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage")>();
  return {
    ...actual,
    saveFile: async (bucket: string, key: string, data: Uint8Array) => {
      saved.push({ bucket, key, data });
      return `${bucket}/${key}`;
    },
    listFiles: async () => [],
    deleteStoredFile: async () => {},
  };
});

import { restoreBackup } from "@/lib/backup/restore-service";
import { createOperation, getProgress } from "@/lib/backup/progress-store";
import { getRestoreZipLimits, RESTORE_ZIP_LIMIT_DEFAULTS } from "@/lib/backup/restore-limits";

const MB = 1024 * 1024;

const EMPTY_DB = {
  users: [{ id: "u1", email: "a@example.com", name: "A" }],
  accounts: [], sessions: [], verificationTokens: [], settings: [], categories: [], topics: [],
  books: [{ id: "b1", title: "Könyv", fileUrl: "ebooks/u1/b1.epub", coverUrl: "covers/u1/b1.jpg", originalFileUrl: null }],
  bookCategories: [], bookTopics: [], readingProgress: [], bookmarks: [], highlights: [], reviews: [],
  likes: [], shelves: [], shelfBooks: [], sharedLinks: [], readingGoals: [], notifications: [],
  follows: [], activities: [], comments: [],
};

const MANIFEST = {
  version: 2,
  createdAt: "2026-11-25T10:00:00.000Z",
  platform: "shelfhaven",
  counts: { users: 1, books: 1 },
  databaseChecksum: "x",
};

async function buildBackup(options: {
  files?: Record<string, string | Buffer>;
  database?: string;
} = {}): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(MANIFEST));
  zip.file("database.json", options.database ?? JSON.stringify(EMPTY_DB));
  const files = options.files ?? {
    "ebooks/u1/b1.epub": Buffer.from("epub-bytes"),
    "covers/u1/b1.jpg": Buffer.from("jpg-bytes"),
  };
  for (const [path, data] of Object.entries(files)) zip.file(`files/${path}`, data);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/** Overwrite the declared uncompressed size of `name` (central directory + local header). */
function forgeDeclaredSize(buf: Buffer, name: string, size: number): void {
  let patched = 0;
  for (let i = 0; i <= buf.length - 30; i++) {
    const sig = buf.readUInt32LE(i);
    if (sig === 0x02014b50 && i <= buf.length - 46) {
      const len = buf.readUInt16LE(i + 28);
      if (buf.toString("utf8", i + 46, i + 46 + len) === name) {
        buf.writeUInt32LE(size, i + 24);
        patched++;
      }
    } else if (sig === 0x04034b50) {
      const len = buf.readUInt16LE(i + 26);
      if (buf.toString("utf8", i + 30, i + 30 + len) === name) {
        buf.writeUInt32LE(size, i + 22);
        patched++;
      }
    }
  }
  if (patched !== 2) throw new Error(`forgeDeclaredSize: patched ${patched} headers for ${name}`);
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

async function restore(buf: Buffer, mode: "wipe" | "merge" = "wipe") {
  const id = createOperation("restore");
  const result = await restoreBackup(id, toArrayBuffer(buf), mode);
  return { result, progress: getProgress(id) };
}

const ENV_KEYS = [
  "RESTORE_ZIP_MAX_FILES",
  "RESTORE_ZIP_MAX_TOTAL_MB",
  "RESTORE_ZIP_MAX_RATIO",
  "RESTORE_ZIP_MAX_DATABASE_MB",
  "RESTORE_ZIP_MAX_FILE_MB",
];

beforeEach(() => {
  dbOps.length = 0;
  saved.length = 0;
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  vi.restoreAllMocks();
});

/** A rejected archive must leave the current data untouched. */
function expectNothingTouched() {
  expect(dbOps).toEqual([]);
  expect(saved).toEqual([]);
}

describe("restoreBackup zip limits", () => {
  it("restores a valid small backup exactly as before", async () => {
    const { result, progress } = await restore(await buildBackup());

    expect(result.success).toBe(true);
    expect(result.stats.filesRestored).toBe(2);
    expect(progress?.status).toBe("completed");
    expect(dbOps[0]).toBe("comment.deleteMany"); // wipe ran
    expect(dbOps).toContain("user.createMany");
    expect(dbOps).toContain("book.createMany");
    expect(saved.map((s) => [s.bucket, s.key, Buffer.from(s.data).toString()])).toEqual([
      ["ebooks", "u1/b1.epub", "epub-bytes"],
      ["covers", "u1/b1.jpg", "jpg-bytes"],
    ]);
  });

  it("rejects too many files before parsing, with a clear error and no changes", async () => {
    process.env.RESTORE_ZIP_MAX_FILES = "5";
    const files: Record<string, string> = {};
    for (let i = 0; i < 10; i++) files[`ebooks/u1/${i}.epub`] = "x";

    const loadSpy = vi.spyOn(JSZip, "loadAsync");
    const { result, progress } = await restore(await buildBackup({ files }));

    expect(result.success).toBe(false);
    expect(progress?.status).toBe("failed");
    // 12 files + 3 directory entries (files/, files/ebooks/, files/ebooks/u1/)
    expect(progress?.error).toBe("Invalid backup: too many files (15, limit 5, RESTORE_ZIP_MAX_FILES)");
    expect(loadSpy).not.toHaveBeenCalled();
    expectNothingTouched();
  });

  it("rejects a declared uncompressed total above the limit", async () => {
    process.env.RESTORE_ZIP_MAX_TOTAL_MB = "100";
    const buf = await buildBackup();
    forgeDeclaredSize(buf, "files/ebooks/u1/b1.epub", 200 * MB);

    const { result, progress } = await restore(buf);

    expect(result.success).toBe(false);
    expect(progress?.error).toBe(
      "Invalid backup: uncompressed size too large (201 MB, limit 100 MB, RESTORE_ZIP_MAX_TOTAL_MB)"
    );
    expectNothingTouched();
  });

  it("rejects a compression ratio above the limit", async () => {
    const buf = await buildBackup({ files: { "ebooks/u1/b1.epub": Buffer.alloc(80 * MB) } });

    const { result, progress } = await restore(buf);

    expect(result.success).toBe(false);
    expect(progress?.error).toMatch(/^Invalid backup: compression ratio too high \(\d+:1, limit 100:1, RESTORE_ZIP_MAX_RATIO\)$/);
    expectNothingTouched();
  });

  it("rejects an oversized database.json without touching the data", async () => {
    process.env.RESTORE_ZIP_MAX_DATABASE_MB = "1";
    const database = JSON.stringify({ ...EMPTY_DB, padding: "p".repeat(2 * MB) });

    const { result, progress } = await restore(await buildBackup({ database }));

    expect(result.success).toBe(false);
    expect(progress?.error).toBe(
      "Invalid backup: database.json exceeds 1 MB when decompressed (RESTORE_ZIP_MAX_DATABASE_MB)"
    );
    expectNothingTouched();
  });

  it("catches a stored file that lies about its size before wiping anything", async () => {
    process.env.RESTORE_ZIP_MAX_FILE_MB = "1";
    const buf = await buildBackup({
      files: { "ebooks/u1/a.epub": "ok", "ebooks/u1/b1.epub": Buffer.alloc(8 * MB) },
    });
    forgeDeclaredSize(buf, "files/ebooks/u1/b1.epub", 100); // declares 100 bytes, inflates to 8 MB

    const { result, progress } = await restore(buf);

    expect(result.success).toBe(false);
    expect(progress?.error).toBe(
      "Invalid backup: files/ebooks/u1/b1.epub exceeds 1 MB when decompressed (RESTORE_ZIP_MAX_FILE_MB)"
    );
    expectNothingTouched();
  });

  it("keeps the merge mode working with the limits", async () => {
    const { result } = await restore(await buildBackup(), "merge");

    expect(result.success).toBe(true);
    expect(dbOps).not.toContain("comment.deleteMany"); // no wipe in merge mode
    expect(saved).toHaveLength(2);
  });
});

describe("getRestoreZipLimits", () => {
  it("uses the documented defaults", () => {
    expect(getRestoreZipLimits({})).toEqual({
      maxFileCount: 20_000,
      maxTotalUncompressedBytes: 4096 * MB,
      maxCompressionRatio: 100,
      ratioCheckMinUncompressedBytes: 64 * MB,
      maxManifestBytes: 1 * MB,
      maxDatabaseJsonBytes: 64 * MB,
      maxFileEntryBytes: 256 * MB,
    });
  });

  it("applies environment overrides (sizes in MB)", () => {
    const limits = getRestoreZipLimits({
      RESTORE_ZIP_MAX_FILES: "50000",
      RESTORE_ZIP_MAX_TOTAL_MB: "10240",
      RESTORE_ZIP_MAX_RATIO: "200",
      RESTORE_ZIP_MAX_DATABASE_MB: "128",
      RESTORE_ZIP_MAX_FILE_MB: "512",
    });
    expect(limits).toMatchObject({
      maxFileCount: 50_000,
      maxTotalUncompressedBytes: 10240 * MB,
      maxCompressionRatio: 200,
      maxDatabaseJsonBytes: 128 * MB,
      maxFileEntryBytes: 512 * MB,
    });
  });

  it("ignores invalid overrides with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const limits = getRestoreZipLimits({ RESTORE_ZIP_MAX_FILES: "abc", RESTORE_ZIP_MAX_FILE_MB: "-5" });

    expect(limits.maxFileCount).toBe(RESTORE_ZIP_LIMIT_DEFAULTS.maxFileCount);
    expect(limits.maxFileEntryBytes).toBe(RESTORE_ZIP_LIMIT_DEFAULTS.maxFileEntryBytes);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
