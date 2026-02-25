import JSZip from "jszip";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { listAllObjects, getFile, getMinioInternalBase } from "@/lib/storage/minio";
import { updateProgress, completeOperation } from "./progress-store";
import type { BackupManifest, DatabaseExport } from "./types";

// Temporary buffer store for completed backups (10 min TTL)
const backupBuffers = new Map<string, { buffer: Uint8Array; createdAt: number }>();

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of backupBuffers) {
      if (now - value.createdAt > 10 * 60 * 1000) {
        backupBuffers.delete(key);
      }
    }
  }, 60_000);
}

export function getBackupBuffer(operationId: string): Uint8Array | undefined {
  return backupBuffers.get(operationId)?.buffer;
}

export async function createBackup(operationId: string): Promise<void> {
  try {
    // Phase 1: Export database (5-30%)
    updateProgress(operationId, { step: "database", message: "Exporting database...", percentage: 5 });

    const db = await exportDatabase((model, index, total) => {
      const pct = 5 + Math.round((index / total) * 25);
      updateProgress(operationId, { step: "database", message: `Exporting ${model}...`, percentage: pct, current: index, total });
    });

    const dbJson = JSON.stringify(db, null, 0);
    const dbChecksum = createHash("sha256").update(dbJson).digest("hex");

    // Phase 2: List MinIO files (30-35%)
    updateProgress(operationId, { step: "files", message: "Listing files...", percentage: 30 });

    const ebookObjects = await listAllObjects("ebooks");
    const coverObjects = await listAllObjects("covers");
    const totalFiles = ebookObjects.length + coverObjects.length;

    // Phase 3: Build ZIP with files (35-90%)
    const zip = new JSZip();

    let filesProcessed = 0;
    const allFiles = [
      ...ebookObjects.map((o) => ({ ...o, bucket: "ebooks" })),
      ...coverObjects.map((o) => ({ ...o, bucket: "covers" })),
    ];

    for (const file of allFiles) {
      try {
        const response = await getFile(file.bucket, file.key);
        if (response.Body) {
          const bodyBytes = await response.Body.transformToByteArray();
          zip.file(`files/${file.bucket}/${file.key}`, bodyBytes);
        }
      } catch {
        // Skip files that can't be read (e.g., deleted but still referenced)
      }
      filesProcessed++;
      const pct = 35 + Math.round((filesProcessed / Math.max(totalFiles, 1)) * 55);
      updateProgress(operationId, {
        step: "files",
        message: `Downloading file ${filesProcessed}/${totalFiles}...`,
        percentage: pct,
        current: filesProcessed,
        total: totalFiles,
      });
    }

    // Phase 4: Build manifest
    const manifest: BackupManifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      platform: "ShelfHaven",
      minioEndpoint: getMinioInternalBase(),
      counts: {
        users: db.users.length,
        accounts: db.accounts.length,
        sessions: db.sessions.length,
        books: db.books.length,
        categories: db.categories.length,
        topics: db.topics.length,
        bookCategories: db.bookCategories.length,
        bookTopics: db.bookTopics.length,
        readingProgress: db.readingProgress.length,
        bookmarks: db.bookmarks.length,
        highlights: db.highlights.length,
        reviews: db.reviews.length,
        likes: db.likes.length,
        shelves: db.shelves.length,
        shelfBooks: db.shelfBooks.length,
        sharedLinks: db.sharedLinks.length,
        readingGoals: db.readingGoals.length,
        settings: db.settings.length,
        verificationTokens: db.verificationTokens.length,
        notifications: db.notifications.length,
        follows: db.follows.length,
        activities: db.activities.length,
        comments: db.comments.length,
        ebookFiles: ebookObjects.length,
        coverFiles: coverObjects.length,
      },
      databaseChecksum: dbChecksum,
    };

    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    zip.file("database.json", dbJson);

    // Phase 5: Generate ZIP (90-99%)
    updateProgress(operationId, { step: "zip", message: "Generating ZIP archive...", percentage: 90 });

    const zipBuffer = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    // Store buffer temporarily
    backupBuffers.set(operationId, { buffer: zipBuffer, createdAt: Date.now() });

    // Save last backup info to Settings
    const totalRecords = Object.values(manifest.counts).reduce((a, b) => a + b, 0);
    const sizeStr = formatSize(zipBuffer.byteLength);
    await prisma.setting.upsert({
      where: { key: "backup_last_date" },
      update: { value: manifest.createdAt },
      create: { key: "backup_last_date", value: manifest.createdAt },
    });
    await prisma.setting.upsert({
      where: { key: "backup_last_size" },
      update: { value: sizeStr },
      create: { key: "backup_last_size", value: sizeStr },
    });
    await prisma.setting.upsert({
      where: { key: "backup_last_counts" },
      update: { value: JSON.stringify(manifest.counts) },
      create: { key: "backup_last_counts", value: JSON.stringify(manifest.counts) },
    });

    completeOperation(operationId);
  } catch (err) {
    completeOperation(operationId, err instanceof Error ? err.message : "Unknown error");
  }
}

async function exportDatabase(
  onProgress: (model: string, index: number, total: number) => void
): Promise<DatabaseExport> {
  const models = [
    "users", "accounts", "sessions", "books", "categories", "topics",
    "bookCategories", "bookTopics", "readingProgress", "bookmarks",
    "highlights", "reviews", "likes", "shelves", "shelfBooks",
    "sharedLinks", "readingGoals", "settings", "verificationTokens",
    "notifications", "follows", "activities", "comments",
  ] as const;

  const result: Record<string, unknown[]> = {};

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    onProgress(model, i + 1, models.length);

    // Map model name to Prisma model accessor
    const data = await queryModel(model);
    result[model] = data;
  }

  return result as unknown as DatabaseExport;
}

async function queryModel(model: string): Promise<unknown[]> {
  switch (model) {
    case "users": return prisma.user.findMany();
    case "accounts": return prisma.account.findMany();
    case "sessions": return prisma.session.findMany();
    case "books": return prisma.book.findMany();
    case "categories": return prisma.category.findMany();
    case "topics": return prisma.topic.findMany();
    case "bookCategories": return prisma.$queryRaw`SELECT * FROM BookCategory`;
    case "bookTopics": return prisma.$queryRaw`SELECT * FROM BookTopic`;
    case "readingProgress": return prisma.readingProgress.findMany();
    case "bookmarks": return prisma.bookmark.findMany();
    case "highlights": return prisma.highlight.findMany();
    case "reviews": return prisma.review.findMany();
    case "likes": return prisma.$queryRaw`SELECT * FROM \`Like\``;
    case "shelves": return prisma.shelf.findMany();
    case "shelfBooks": return prisma.$queryRaw`SELECT * FROM ShelfBook`;
    case "sharedLinks": return prisma.sharedLink.findMany();
    case "readingGoals": return prisma.readingGoal.findMany();
    case "settings": return prisma.setting.findMany();
    case "verificationTokens": return prisma.verificationToken.findMany();
    case "notifications": return prisma.notification.findMany();
    case "follows": return prisma.follow.findMany();
    case "activities": return prisma.activity.findMany();
    case "comments": return prisma.comment.findMany();
    default: return [];
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
