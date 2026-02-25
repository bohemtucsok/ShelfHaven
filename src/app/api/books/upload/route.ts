import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadFile, getPublicUrl } from "@/lib/storage/minio";
import { parseEpub } from "@/lib/ebook/epub-parser";
import { downloadAndResizeCover, generateBlurHash } from "@/lib/ebook/cover-utils";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit, UPLOAD_LIMIT } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/security-logger";
import { createActivity } from "@/lib/activity";

const ALLOWED_EXTENSIONS = ["epub", "pdf", "mobi", "fb2", "djvu", "azw3", "cbr", "cbz"];
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

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

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const title = formData.get("title") as string | null;
  const author = formData.get("author") as string | null;
  const description = formData.get("description") as string | null;
  const externalCoverUrl = formData.get("coverUrl") as string | null;
  const categoryIdsRaw = formData.get("categoryIds") as string | null;
  let categoryIds: string[] = [];
  if (categoryIdsRaw) {
    try { categoryIds = JSON.parse(categoryIdsRaw); } catch {}
  }
  const topicIds = formData.getAll("topicIds") as string[];

  if (!file) {
    return NextResponse.json({ error: "Nincs fájl csatolva" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "A fájl mérete meghaladja a 100MB limitet" },
      { status: 400 }
    );
  }

  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return NextResponse.json(
      { error: `Nem támogatott formátum: ${extension}. Támogatott: ${ALLOWED_EXTENSIONS.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());

    if (!validateFileContent(buffer, extension)) {
      return NextResponse.json(
        { error: "A fájl tartalma nem egyezik a kiterjesztéssel" },
        { status: 400 }
      );
    }

    const timestamp = Date.now();
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileKey = `${session.user.id}/${timestamp}_${safeFilename}`;

    // Upload ebook to MinIO
    const fileUrl = await uploadFile(
      process.env.MINIO_BUCKET_EBOOKS!,
      fileKey,
      buffer,
      file.type || "application/octet-stream"
    );

    // Extract EPUB metadata and cover if applicable
    let epubTitle = title;
    let epubAuthor = author;
    let epubDescription = description;
    let coverUrl: string | null = null;
    let coverBuffer: Buffer | null = null;

    if (extension === "epub") {
      try {
        const metadata = await parseEpub(buffer);
        if (!epubTitle && metadata.title) epubTitle = metadata.title;
        if (!epubAuthor && metadata.author) epubAuthor = metadata.author;
        if (!epubDescription && metadata.description) epubDescription = metadata.description;

        // Upload cover image from EPUB to MinIO (only if no external cover provided)
        if (!externalCoverUrl && metadata.coverImage) {
          coverBuffer = metadata.coverImage.data;
          const coverKey = `${session.user.id}/${timestamp}_cover_${metadata.coverImage.filename}`;
          coverUrl = await uploadFile(
            process.env.MINIO_BUCKET_COVERS!,
            coverKey,
            metadata.coverImage.data,
            metadata.coverImage.contentType
          );
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
          coverUrl = await uploadFile(
            process.env.MINIO_BUCKET_COVERS!,
            coverKey,
            coverResult.data,
            coverResult.contentType
          );
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
        title: epubTitle || file.name.replace(/\.[^/.]+$/, ""),
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

    // Replace direct MinIO cover URL with proxy URL for client
    const responseBook = {
      ...book,
      coverUrl: book.coverUrl ? `/api/books/${book.id}/cover` : null,
    };

    logSecurityEvent("UPLOAD_SUCCESS", { request, userId: session.user.id, details: file.name });

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
  }
}
