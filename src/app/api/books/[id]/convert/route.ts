import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFile, uploadFile } from "@/lib/storage/minio";
import { convertToEpub } from "@/lib/ebook/calibre";
import { createNotification } from "@/lib/notifications";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit, API_LIMIT } from "@/lib/rate-limit";

type RouteParams = { params: Promise<{ id: string }> };

// GET - conversion status polling
export async function GET(
  _request: NextRequest,
  { params }: RouteParams
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const book = await prisma.book.findUnique({
    where: { id },
    select: { conversionStatus: true, conversionError: true },
  });

  if (!book) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    conversionStatus: book.conversionStatus,
    conversionError: book.conversionError,
  });
}

// POST - trigger conversion (called internally after upload)
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;

  const rateLimited = checkRateLimit(request, "convert", API_LIMIT);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: bookId } = await params;

  const book = await prisma.book.findUnique({
    where: { id: bookId },
    select: {
      id: true,
      fileUrl: true,
      originalFileUrl: true,
      originalFormat: true,
      conversionStatus: true,
      userId: true,
      title: true,
    },
  });

  if (!book) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Only book owner can trigger conversion
  if (book.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (book.originalFormat === "epub") {
    return NextResponse.json({ error: "Already EPUB" }, { status: 400 });
  }

  if (book.conversionStatus === "converting") {
    return NextResponse.json({ error: "Conversion in progress" }, { status: 409 });
  }

  // Mark as converting
  await prisma.book.update({
    where: { id: bookId },
    data: { conversionStatus: "converting" },
  });

  try {
    // Download original file from MinIO (use originalFileUrl if re-converting)
    const fileUrl = book.originalFileUrl || book.fileUrl;
    const urlParts = new URL(fileUrl);
    const pathParts = urlParts.pathname.split("/");
    // path format: /ebooks/userId/timestamp_filename.pdf
    const bucket = pathParts[1]; // "ebooks"
    const key = pathParts.slice(2).join("/"); // "userId/timestamp_filename.pdf"

    const fileResponse = await getFile(bucket, key);
    const bodyStream = fileResponse.Body;
    if (!bodyStream) {
      throw new Error("Failed to read file from storage");
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    // @ts-expect-error - AWS SDK stream
    for await (const chunk of bodyStream) {
      chunks.push(chunk as Uint8Array);
    }
    const fileBuffer = Buffer.concat(chunks);

    const filename = key.split("/").pop() || `input.${book.originalFormat}`;

    // Call Calibre conversion service
    const result = await convertToEpub(fileBuffer, filename);

    if (!result.success || !result.data) {
      await prisma.book.update({
        where: { id: bookId },
        data: {
          conversionStatus: "failed",
          conversionError: result.error || "Ismeretlen hiba",
        },
      });

      createNotification({
        userId: book.userId,
        type: "conversion",
        message: `A(z) "${book.title}" könyv EPUB konverziója sikertelen: ${result.error}`,
        bookId,
      }).catch(() => {});

      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    // Upload converted EPUB to MinIO
    const timestamp = Date.now();
    const baseName = filename.replace(/\.[^/.]+$/, "");
    const epubKey = `${book.userId}/${timestamp}_${baseName}.epub`;

    const epubUrl = await uploadFile(
      process.env.MINIO_BUCKET_EBOOKS || "ebooks",
      epubKey,
      result.data,
      "application/epub+zip"
    );

    // Update book: fileUrl points to EPUB, preserve original file URL
    await prisma.book.update({
      where: { id: bookId },
      data: {
        fileUrl: epubUrl,
        // Only set originalFileUrl on first conversion (keep original PDF/MOBI URL)
        ...(book.originalFileUrl ? {} : { originalFileUrl: book.fileUrl }),
        conversionStatus: "completed",
        conversionError: null,
      },
    });

    createNotification({
      userId: book.userId,
      type: "conversion",
      message: `A(z) "${book.title}" könyv sikeresen konvertálva EPUB formátumba!`,
      bookId,
    }).catch(() => {});

    return NextResponse.json({
      conversionStatus: "completed",
      fileUrl: epubUrl,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Ismeretlen hiba";

    await prisma.book.update({
      where: { id: bookId },
      data: {
        conversionStatus: "failed",
        conversionError: errorMsg,
      },
    });

    createNotification({
      userId: book.userId,
      type: "conversion",
      message: `A(z) "${book.title}" könyv EPUB konverziója sikertelen`,
      bookId,
    }).catch(() => {});

    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
