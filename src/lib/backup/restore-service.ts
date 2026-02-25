import JSZip from "jszip";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { uploadFile, listAllObjects, deleteFile } from "@/lib/storage/minio";
import { updateProgress, completeOperation } from "./progress-store";
import type { RestoreMode, BackupManifest, DatabaseExport, RestoreResult } from "./types";

const manifestSchema = z.object({
  version: z.literal(1),
  createdAt: z.string(),
  platform: z.string(),
  minioEndpoint: z.string(),
  counts: z.record(z.string(), z.number()),
  databaseChecksum: z.string(),
});

export async function restoreBackup(
  operationId: string,
  zipBuffer: ArrayBuffer,
  mode: RestoreMode
): Promise<RestoreResult> {
  const startTime = Date.now();
  let recordsRestored = 0;
  let filesRestored = 0;

  try {
    // Phase 1: Read and validate ZIP (0-5%)
    updateProgress(operationId, { step: "validate", message: "Reading ZIP archive...", percentage: 2 });

    const zip = await JSZip.loadAsync(zipBuffer);
    const manifestFile = zip.file("manifest.json");
    if (!manifestFile) {
      throw new Error("Invalid backup: missing manifest.json");
    }

    const manifestRaw = JSON.parse(await manifestFile.async("string"));
    const manifestResult = manifestSchema.safeParse(manifestRaw);
    if (!manifestResult.success) {
      throw new Error("Invalid backup: manifest.json validation failed");
    }
    const manifest: BackupManifest = manifestRaw;

    const dbFile = zip.file("database.json");
    if (!dbFile) {
      throw new Error("Invalid backup: missing database.json");
    }

    updateProgress(operationId, { step: "validate", message: "Parsing database...", percentage: 5 });
    const db: DatabaseExport = JSON.parse(await dbFile.async("string"));

    // Phase 2: Wipe existing data if mode === "wipe" (10-20%)
    if (mode === "wipe") {
      updateProgress(operationId, { step: "wipe", message: "Deleting existing data...", percentage: 10 });
      await wipeDatabase();

      updateProgress(operationId, { step: "wipe", message: "Deleting existing files...", percentage: 15 });
      await wipeMinioFiles();
    }

    // Phase 3: Restore database records in FK-safe order (20-50%)
    updateProgress(operationId, { step: "database", message: "Restoring database...", percentage: 20 });

    const minioEndpointOld = manifest.minioEndpoint;
    const minioEndpointNew = `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`;

    recordsRestored = await restoreDatabase(db, mode, minioEndpointOld, minioEndpointNew, (model, index, total) => {
      const pct = 20 + Math.round((index / total) * 30);
      updateProgress(operationId, { step: "database", message: `Restoring ${model}...`, percentage: pct, current: index, total });
    });

    // Phase 4: Restore MinIO files (50-95%)
    const filesFolder = zip.folder("files");
    if (filesFolder) {
      const fileEntries: { path: string; bucket: string; key: string }[] = [];
      filesFolder.forEach((relativePath, file) => {
        if (!file.dir) {
          const parts = relativePath.split("/");
          const bucket = parts[0]; // "ebooks" or "covers"
          const key = parts.slice(1).join("/");
          if (bucket && key) {
            fileEntries.push({ path: relativePath, bucket, key });
          }
        }
      });

      for (let i = 0; i < fileEntries.length; i++) {
        const entry = fileEntries[i];
        const pct = 50 + Math.round(((i + 1) / fileEntries.length) * 45);
        updateProgress(operationId, {
          step: "files",
          message: `Restoring file ${i + 1}/${fileEntries.length}...`,
          percentage: pct,
          current: i + 1,
          total: fileEntries.length,
        });

        try {
          const fileData = await filesFolder.file(entry.path)?.async("uint8array");
          if (fileData) {
            const contentType = guessContentType(entry.key);
            await uploadFile(entry.bucket, entry.key, Buffer.from(fileData), contentType);
            filesRestored++;
          }
        } catch {
          // Skip individual file errors
        }
      }
    }

    completeOperation(operationId);

    return {
      success: true,
      operationId,
      stats: {
        tablesRestored: 23,
        recordsRestored,
        filesRestored,
        duration: (Date.now() - startTime) / 1000,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    completeOperation(operationId, message);
    return {
      success: false,
      operationId,
      stats: { tablesRestored: 0, recordsRestored, filesRestored, duration: (Date.now() - startTime) / 1000 },
    };
  }
}

// Delete all records in reverse FK order
async function wipeDatabase(): Promise<void> {
  // Child tables first, then parent tables
  await prisma.comment.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.readingGoal.deleteMany();
  await prisma.sharedLink.deleteMany();
  await prisma.$executeRaw`DELETE FROM ShelfBook`;
  await prisma.shelf.deleteMany();
  await prisma.$executeRaw`DELETE FROM \`Like\``;
  await prisma.review.deleteMany();
  await prisma.highlight.deleteMany();
  await prisma.bookmark.deleteMany();
  await prisma.readingProgress.deleteMany();
  await prisma.$executeRaw`DELETE FROM BookTopic`;
  await prisma.$executeRaw`DELETE FROM BookCategory`;
  await prisma.book.deleteMany();
  await prisma.topic.deleteMany();
  await prisma.category.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.user.deleteMany();
}

async function wipeMinioFiles(): Promise<void> {
  for (const bucket of ["ebooks", "covers"]) {
    const objects = await listAllObjects(bucket);
    for (const obj of objects) {
      await deleteFile(bucket, obj.key);
    }
  }
}

// Restore DB records in FK-safe insertion order
async function restoreDatabase(
  db: DatabaseExport,
  mode: RestoreMode,
  oldEndpoint: string,
  newEndpoint: string,
  onProgress: (model: string, index: number, total: number) => void
): Promise<number> {
  let total = 0;
  const skipDuplicates = mode === "merge";

  // Rewrite MinIO URLs in book records
  const books = db.books.map((b) => rewriteUrls(b, oldEndpoint, newEndpoint));

  const insertOrder: { name: string; fn: () => Promise<number> }[] = [
    { name: "users", fn: () => insertMany("user", db.users, skipDuplicates) },
    { name: "accounts", fn: () => insertMany("account", db.accounts, skipDuplicates) },
    { name: "sessions", fn: () => insertMany("session", db.sessions, skipDuplicates) },
    { name: "verificationTokens", fn: () => insertRaw("VerificationToken", db.verificationTokens, skipDuplicates) },
    { name: "settings", fn: () => insertMany("setting", db.settings, skipDuplicates) },
    { name: "categories", fn: () => insertMany("category", db.categories, skipDuplicates) },
    { name: "topics", fn: () => insertMany("topic", db.topics, skipDuplicates) },
    { name: "books", fn: () => insertMany("book", books, skipDuplicates) },
    { name: "bookCategories", fn: () => insertRaw("BookCategory", db.bookCategories, skipDuplicates) },
    { name: "bookTopics", fn: () => insertRaw("BookTopic", db.bookTopics, skipDuplicates) },
    { name: "readingProgress", fn: () => insertMany("readingProgress", db.readingProgress, skipDuplicates) },
    { name: "bookmarks", fn: () => insertMany("bookmark", db.bookmarks, skipDuplicates) },
    { name: "highlights", fn: () => insertMany("highlight", db.highlights, skipDuplicates) },
    { name: "reviews", fn: () => insertMany("review", db.reviews, skipDuplicates) },
    { name: "likes", fn: () => insertRaw("`Like`", db.likes, skipDuplicates) },
    { name: "shelves", fn: () => insertMany("shelf", db.shelves, skipDuplicates) },
    { name: "shelfBooks", fn: () => insertRaw("ShelfBook", db.shelfBooks, skipDuplicates) },
    { name: "sharedLinks", fn: () => insertMany("sharedLink", db.sharedLinks, skipDuplicates) },
    { name: "readingGoals", fn: () => insertMany("readingGoal", db.readingGoals, skipDuplicates) },
    { name: "notifications", fn: () => insertMany("notification", db.notifications, skipDuplicates) },
    { name: "follows", fn: () => insertMany("follow", db.follows, skipDuplicates) },
    { name: "activities", fn: () => insertMany("activity", db.activities, skipDuplicates) },
    { name: "comments", fn: () => insertComments(db.comments, skipDuplicates) },
  ];

  for (let i = 0; i < insertOrder.length; i++) {
    const { name, fn } = insertOrder[i];
    onProgress(name, i + 1, insertOrder.length);
    const count = await fn();
    total += count;
  }

  return total;
}

// Generic insert via Prisma createMany
async function insertMany(model: string, records: Record<string, unknown>[], skipDuplicates: boolean): Promise<number> {
  if (records.length === 0) return 0;

  const data = records.map(deserializeDates);

  // Prisma createMany in batches of 500
  const batchSize = 500;
  let inserted = 0;
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (prisma as any)[model].createMany({ data: batch, skipDuplicates });
      inserted += result.count;
    } catch {
      // On error in batch, try one by one
      for (const record of batch) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (prisma as any)[model].create({ data: record });
          inserted++;
        } catch (e) {
          if (!skipDuplicates) throw e;
        }
      }
    }
  }
  return inserted;
}

// Allowed table names for raw insert (whitelist)
const ALLOWED_RAW_TABLES = new Set(["BookCategory", "BookTopic", "`Like`", "ShelfBook", "VerificationToken"]);

// Validate column name: only alphanumeric and underscore allowed
function isValidColumnName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

// Raw insert for join tables without Prisma model accessor.
// Uses $executeRawUnsafe for dynamic table/column names, but SQL injection is prevented by:
// 1. Table name whitelist (ALLOWED_RAW_TABLES)
// 2. Column name regex validation (isValidColumnName)
// 3. Parameterized values (passed as spread args, not interpolated)
async function insertRaw(tableName: string, records: Record<string, unknown>[], skipDuplicates: boolean): Promise<number> {
  if (records.length === 0) return 0;
  if (!ALLOWED_RAW_TABLES.has(tableName)) {
    throw new Error(`Invalid table name for raw insert: ${tableName}`);
  }

  let inserted = 0;
  for (const record of records) {
    const data = deserializeDates(record);
    const columns = Object.keys(data);

    // Validate all column names to prevent SQL injection
    for (const col of columns) {
      if (!isValidColumnName(col)) {
        throw new Error(`Invalid column name: ${col}`);
      }
    }

    const values = Object.values(data);
    const placeholders = columns.map(() => "?").join(", ");
    const columnList = columns.map((c) => `\`${c}\``).join(", ");

    const ignore = skipDuplicates ? "IGNORE" : "";
    try {
      await prisma.$executeRawUnsafe(
        `INSERT ${ignore} INTO ${tableName} (${columnList}) VALUES (${placeholders})`,
        ...values
      );
      inserted++;
    } catch (e) {
      if (!skipDuplicates) throw e;
    }
  }
  return inserted;
}

// Comments need topological sort for parentId self-reference
async function insertComments(records: Record<string, unknown>[], skipDuplicates: boolean): Promise<number> {
  if (records.length === 0) return 0;

  // Sort: parents first (parentId === null), then children
  const roots = records.filter((r) => !r.parentId);
  const children = records.filter((r) => r.parentId);

  const sorted = [...roots];
  const insertedIds = new Set(roots.map((r) => r.id as string));
  let remaining = [...children];

  // Iteratively add children whose parent is already inserted
  let maxIterations = children.length + 1;
  while (remaining.length > 0 && maxIterations > 0) {
    const next: Record<string, unknown>[] = [];
    const stillRemaining: Record<string, unknown>[] = [];
    for (const c of remaining) {
      if (insertedIds.has(c.parentId as string)) {
        next.push(c);
        insertedIds.add(c.id as string);
      } else {
        stillRemaining.push(c);
      }
    }
    sorted.push(...next);
    remaining = stillRemaining;
    maxIterations--;
  }
  // Add any orphans at the end
  sorted.push(...remaining);

  return insertMany("comment", sorted, skipDuplicates);
}

// Convert ISO date strings back to Date objects for Prisma
function deserializeDates(record: Record<string, unknown>): Record<string, unknown> {
  const result = { ...record };
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      result[key] = new Date(value);
    }
    // Handle BigInt from raw queries (serialized as string)
    if (typeof value === "string" && key === "position" && /^\d+$/.test(value)) {
      result[key] = parseInt(value, 10);
    }
  }
  return result;
}

// Rewrite MinIO URLs in book records
function rewriteUrls(record: Record<string, unknown>, oldEndpoint: string, newEndpoint: string): Record<string, unknown> {
  if (oldEndpoint === newEndpoint) return record;
  const result = { ...record };
  for (const key of ["fileUrl", "coverUrl", "originalFileUrl"]) {
    if (typeof result[key] === "string" && (result[key] as string).startsWith(oldEndpoint)) {
      result[key] = (result[key] as string).replace(oldEndpoint, newEndpoint);
    }
  }
  return result;
}

function guessContentType(key: string): string {
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
