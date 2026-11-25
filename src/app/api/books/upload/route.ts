import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  saveFile,
  sanitizeKeySegment,
  createTempPath,
  commitTempFile,
  resolveStoragePath,
} from "@/lib/storage";
import { parseEpub } from "@/lib/ebook/epub-parser";
import { downloadAndResizeCover, generateBlurHash } from "@/lib/ebook/cover-utils";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit, UPLOAD_LIMIT } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security-logger";
import { createActivity } from "@/lib/activity";
import { MAX_UPLOAD_FILE_SIZE, MULTIPART_OVERHEAD_ALLOWANCE } from "@/lib/upload-limits";
import { declaredLengthExceeds, limitBodyStream } from "@/lib/request-body";
import {
  receiveMultipart,
  MultipartFormatError,
  MultipartLimitError,
  type MultipartLimits,
  type MultipartResult,
} from "@/lib/multipart-upload";

const MAX_BODY_SIZE = MAX_UPLOAD_FILE_SIZE + MULTIPART_OVERHEAD_ALLOWANCE;

function payloadTooLarge() {
  return NextResponse.json(
    { error: "A kérés mérete meghaladja a 100MB limitet" },
    { status: 413 }
  );
}

function fileTooLarge() {
  return NextResponse.json(
    { error: "A fájl mérete meghaladja a 100MB limitet" },
    { status: 413 }
  );
}

/** Explicit busboy limits; the whole body is additionally capped at MAX_BODY_SIZE. */
const UPLOAD_LIMITS: MultipartLimits = {
  fileSize: MAX_UPLOAD_FILE_SIZE,
  fields: 200, // title, author, description, coverUrl, categoryIds + repeated topicIds
  fieldSize: MULTIPART_OVERHEAD_ALLOWANCE,
  parts: 201,
  headerPairs: 8,
};

function extensionOf(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() || "";
}

const ALLOWED_EXTENSIONS = ["epub", "pdf", "mobi", "fb2", "djvu", "azw3", "cbr", "cbz"];

const MAGIC_BYTES: Record<string, number[][]> = {
  epub: [[0x50, 0x4B, 0x03, 0x04]], // ZIP (EPUB is a ZIP)
  pdf: [[0x25, 0x50, 0x44, 0x46]], // %PDF
  cbz: [[0x50, 0x4B, 0x03, 0x04]], // ZIP (CBZ is a ZIP)
  cbr: [[0x52, 0x61, 0x72, 0x21]], // Rar! (CBR is a RAR)
  djvu: [[0x41, 0x54, 0x26, 0x54]], // AT&T (DJVU)
};

// Formats validated by content structure instead of magic bytes
const STRUCTURE_VALIDATORS: Record<string, (buf: Buffer) => boolean> = {
  mobi: (buf) => {
    // MOBI/PRC: "BOOKMOBI" at offset 60, or PalmDOC header
    if (buf.length < 68) return false;
    const sig = buf.subarray(60, 68).toString("ascii");
    return sig === "BOOKMOBI" || sig.startsWith("TEXtREAd");
  },
  azw3: (buf) => {
    // AZW3 (KF8): same as MOBI - "BOOKMOBI" at offset 60
    if (buf.length < 68) return false;
    return buf.subarray(60, 68).toString("ascii") === "BOOKMOBI";
  },
  fb2: (buf) => {
    // FB2: XML file starting with <?xml or <FictionBook
    const head = buf.subarray(0, Math.min(200, buf.length)).toString("utf-8").trimStart();
    return head.startsWith("<?xml") || head.startsWith("<FictionBook");
  },
};

function validateFileContent(buffer: Buffer, extension: string): boolean {
  // Check magic bytes first
  const signatures = MAGIC_BYTES[extension];
  if (signatures) {
    return signatures.some(sig =>
      sig.every((byte, i) => buffer[i] === byte)
    );
  }
  // Check structure validators
  const structValidator = STRUCTURE_VALIDATORS[extension];
  if (structValidator) {
    return structValidator(buffer);
  }
  // Unknown format - reject (fail-closed)
  return false;
}

export async function POST(request: NextRequest) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;

  const rateLimited = checkRateLimit(request, "upload", UPLOAD_LIMIT);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Body size limit before reading (declared length) ...
  if (declaredLengthExceeds(request, MAX_BODY_SIZE)) {
    return payloadTooLarge();
  }

  // ... and while reading (missing or forged Content-Length). The file part is
  // streamed into a temporary file in the storage directory; the body is never
  // buffered as a whole.
  const limited = limitBodyStream(request, MAX_BODY_SIZE);
  const tmpPath = await createTempPath("ebooks");
  let committed = false;

  try {
    let parsed: MultipartResult;
    try {
      parsed = await receiveMultipart(limited.body, {
        contentType: request.headers.get("content-type") ?? "",
        fileField: "file",
        tmpPath,
        acceptFile: (name) => ALLOWED_EXTENSIONS.includes(extensionOf(name)),
        limits: UPLOAD_LIMITS,
      });
    } catch (error) {
      if (limited.exceeded()) return payloadTooLarge();
      if (error instanceof MultipartLimitError) {
        return error.kind === "file" ? fileTooLarge() : payloadTooLarge();
      }
      if (error instanceof MultipartFormatError) {
        return NextResponse.json({ error: "Hibás feltöltési kérés" }, { status: 400 });
      }
      throw error;
    }

    const field = (name: string) => parsed.fields.get(name)?.[0] ?? null;
    const file = parsed.file;
    const title = field("title");
    const author = field("author");
    const description = field("description");
    const externalCoverUrl = field("coverUrl");
    const categoryIdsRaw = field("categoryIds");
    let categoryIds: string[] = [];
    if (categoryIdsRaw) {
      try { categoryIds = JSON.parse(categoryIdsRaw); } catch {}
    }
    const topicIds = parsed.fields.get("topicIds") ?? [];

    if (!file) {
      return NextResponse.json({ error: "Nincs fájl csatolva" }, { status: 400 });
    }

    const extension = extensionOf(file.filename);
    if (!ALLOWED_EXTENSIONS.includes(extension) || !file.path) {
      return NextResponse.json(
        { error: `Nem támogatott formátum: ${extension}. Támogatott: ${ALLOWED_EXTENSIONS.join(", ")}` },
        { status: 400 }
      );
    }

    if (!validateFileContent(file.head, extension)) {
      return NextResponse.json(
        { error: "A fájl tartalma nem egyezik a kiterjesztéssel" },
        { status: 400 }
      );
    }

    const timestamp = Date.now();
    const safeFilename = file.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileKey = `${session.user.id}/${timestamp}_${safeFilename}`;

    // Store ebook file (atomic rename of the temporary file)
    const fileUrl = await commitTempFile(tmpPath, "ebooks", fileKey);
    committed = true;

    // Extract EPUB metadata and cover if applicable
    let epubTitle = title;
    let epubAuthor = author;
    let epubDescription = description;
    let coverUrl: string | null = null;
    let coverBuffer: Buffer | null = null;

    if (extension === "epub") {
      try {
        // JSZip needs the whole archive: read it back only for EPUBs.
        const buffer = await fs.readFile(resolveStoragePath("ebooks", fileKey));
        const metadata = await parseEpub(buffer);
        if (!epubTitle && metadata.title) epubTitle = metadata.title;
        if (!epubAuthor && metadata.author) epubAuthor = metadata.author;
        if (!epubDescription && metadata.description) epubDescription = metadata.description;

        // Store cover image from EPUB (only if no external cover provided)
        if (!externalCoverUrl && metadata.coverImage) {
          coverBuffer = metadata.coverImage.data;
          const coverKey = `${session.user.id}/${timestamp}_cover_${sanitizeKeySegment(metadata.coverImage.filename)}`;
          coverUrl = await saveFile("covers", coverKey, metadata.coverImage.data);
        }
      } catch (e) {
        console.warn("EPUB metadata extraction failed, using manual values:", e);
      }
    }

    // Download and upload external cover image (from metadata search)
    if (externalCoverUrl && !coverUrl) {
      try {
        const coverResult = await downloadAndResizeCover(externalCoverUrl);
        if (coverResult) {
          coverBuffer = coverResult.data;
          const coverKey = `${session.user.id}/${timestamp}_cover.jpg`;
          coverUrl = await saveFile("covers", coverKey, coverResult.data);
        }
      } catch (e) {
        console.warn("External cover download failed:", e);
      }
    }

    // Generate blurhash from cover image for blur placeholder
    let blurHash: string | null = null;
    if (coverBuffer) {
      blurHash = await generateBlurHash(coverBuffer);
    }

    // For non-EPUB: set conversion status to pending
    const isEpub = extension === "epub";
    const conversionStatus = isEpub ? "none" : "pending";

    // Create book record
    const book = await prisma.book.create({
      data: {
        title: epubTitle || file.filename.replace(/\.[^/.]+$/, ""),
        author: epubAuthor || null,
        description: epubDescription || null,
        fileUrl,
        coverUrl,
        originalFormat: extension,
        fileSize: file.size,
        userId: session.user.id,
        blurHash,
        conversionStatus,
        ...(categoryIds.length > 0 && {
          categories: {
            create: categoryIds.map((categoryId) => ({ categoryId })),
          },
        }),
        ...(topicIds.length > 0 && {
          topics: {
            create: topicIds.map((topicId) => ({ topicId })),
          },
        }),
      },
      include: {
        categories: { include: { category: true } },
        topics: { include: { topic: true } },
      },
    });

    // Trigger async conversion for non-EPUB files
    if (!isEpub) {
      // Always use localhost for internal self-calls (same container)
      // Forward cookies so the convert endpoint auth check passes
      const cookieHeader = request.headers.get("cookie");
      fetch(`http://localhost:3000/api/books/${book.id}/convert`, {
        method: "POST",
        headers: cookieHeader ? { cookie: cookieHeader } : {},
      }).catch((err) => {
        console.error("Failed to trigger conversion:", err);
      });
    }

    // Replace storage references with proxy URLs for client
    const responseBook = {
      ...book,
      fileUrl: `/api/books/${book.id}/download`,
      coverUrl: book.coverUrl ? `/api/books/${book.id}/cover` : null,
    };

    logSecurityEvent("UPLOAD_SUCCESS", { request, userId: session.user.id, details: file.filename });

    createActivity({
      userId: session.user.id,
      type: "book_upload",
      bookId: book.id,
    }).catch(() => {});

    return NextResponse.json(responseBook, { status: 201 });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Hiba történt a feltöltés során" },
      { status: 500 }
    );
  } finally {
    if (!committed) await fs.rm(tmpPath, { force: true });
  }
}
