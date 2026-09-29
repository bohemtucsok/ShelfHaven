import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

/**
 * Local filesystem storage.
 *
 * Files live under STORAGE_DIR (default: ./storage), one subdirectory per bucket:
 *   <STORAGE_DIR>/ebooks/<userId>/<timestamp>_<filename>
 *   <STORAGE_DIR>/covers/<userId>/<timestamp>_cover.jpg
 *
 * The database stores a storage reference ("<bucket>/<key>"). Legacy rows may still
 * hold full MinIO URLs ("http://minio:9000/<bucket>/<key>") — parseStorageRef accepts both.
 */

export const BUCKETS = ["ebooks", "covers"] as const;
export type Bucket = (typeof BUCKETS)[number];

export interface StorageLocation {
  bucket: Bucket;
  key: string;
}

const TMP_SUFFIX = ".tmp";

export function getStorageRoot(): string {
  return path.resolve(process.env.STORAGE_DIR || "./storage");
}

function isBucket(value: string): value is Bucket {
  return (BUCKETS as readonly string[]).includes(value);
}

function isValidKey(key: string): boolean {
  if (!key || key.length > 1024 || key.includes("\0") || key.includes("\\")) return false;
  if (key.startsWith("/")) return false;
  return key.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/** Absolute path of a stored object; throws if the key would escape its bucket directory. */
export function resolveStoragePath(bucket: string, key: string): string {
  if (!isBucket(bucket)) {
    throw new Error(`Invalid storage bucket: ${bucket}`);
  }
  if (!isValidKey(key)) {
    throw new Error("Invalid storage key");
  }
  const bucketDir = path.join(getStorageRoot(), bucket);
  const fullPath = path.resolve(bucketDir, key);
  if (!fullPath.startsWith(bucketDir + path.sep)) {
    throw new Error("Invalid storage key");
  }
  return fullPath;
}

/**
 * Parse a stored reference into bucket + key.
 * Accepts "ebooks/u1/file.epub" and legacy "http://minio:9000/ebooks/u1/file.epub".
 */
export function parseStorageRef(ref: string | null | undefined): StorageLocation | null {
  if (!ref) return null;
  let rest = ref;
  const legacy = /^https?:\/\/[^/]+\/(.+)$/i.exec(ref);
  if (legacy) {
    rest = legacy[1];
  }
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  const bucket = rest.slice(0, slash);
  const key = rest.slice(slash + 1);
  if (!isBucket(bucket) || !isValidKey(key)) return null;
  return { bucket, key };
}

export function toStorageRef(bucket: Bucket, key: string): string {
  return `${bucket}/${key}`;
}

/** Make a single path segment safe for use in a storage key. */
export function sanitizeKeySegment(name: string): string {
  const base = name.split(/[/\\]/).pop() || "";
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "_");
  return safe || "file";
}

export function guessContentType(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "epub": return "application/epub+zip";
    case "pdf": return "application/pdf";
    case "mobi": return "application/x-mobipocket-ebook";
    case "jpg": case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "webp": return "image/webp";
    case "gif": return "image/gif";
    default: return "application/octet-stream";
  }
}

function isNotFound(err: unknown): boolean {
  return (err as NodeJS.ErrnoException)?.code === "ENOENT";
}

/** Write a file atomically (temp file + rename) and return its storage reference. */
export async function saveFile(bucket: Bucket, key: string, body: Buffer | Uint8Array): Promise<string> {
  const fullPath = resolveStoragePath(bucket, key);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  const tmpPath = `${fullPath}.${randomUUID()}${TMP_SUFFIX}`;
  try {
    await fs.writeFile(tmpPath, body);
    await fs.rename(tmpPath, fullPath);
  } catch (err) {
    await fs.rm(tmpPath, { force: true });
    throw err;
  }
  return toStorageRef(bucket, key);
}

/** Read a stored file into memory. Returns null if the reference is invalid or the file is missing. */
export async function readStoredFile(
  ref: string | null | undefined
): Promise<{ data: Buffer; contentType: string } | null> {
  const loc = parseStorageRef(ref);
  if (!loc) return null;
  try {
    const data = await fs.readFile(resolveStoragePath(loc.bucket, loc.key));
    return { data, contentType: guessContentType(loc.key) };
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/** Open a stored file as a web stream (for large downloads). Returns null if missing. */
export async function openStoredFile(
  ref: string | null | undefined
): Promise<{ stream: ReadableStream<Uint8Array>; size: number; contentType: string; key: string } | null> {
  const loc = parseStorageRef(ref);
  if (!loc) return null;
  const fullPath = resolveStoragePath(loc.bucket, loc.key);
  try {
    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) return null;
    const stream = Readable.toWeb(createReadStream(fullPath)) as ReadableStream<Uint8Array>;
    return { stream, size: stat.size, contentType: guessContentType(loc.key), key: loc.key };
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/** Delete a stored file. Missing files and invalid references are ignored. */
export async function deleteStoredFile(ref: string | null | undefined): Promise<void> {
  const loc = parseStorageRef(ref);
  if (!loc) return;
  await fs.rm(resolveStoragePath(loc.bucket, loc.key), { force: true });
}

/** List all files of a bucket (keys relative to the bucket directory). */
export async function listFiles(bucket: Bucket): Promise<{ key: string; size: number }[]> {
  const bucketDir = path.join(getStorageRoot(), bucket);
  const result: { key: string; size: number }[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (isNotFound(err)) return;
      throw err;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && !entry.name.endsWith(TMP_SUFFIX)) {
        const { size } = await fs.stat(fullPath);
        result.push({ key: path.relative(bucketDir, fullPath).split(path.sep).join("/"), size });
      }
    }
  }

  await walk(bucketDir);
  return result;
}
