import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { openStoredFile } from "@/lib/storage";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit, DOWNLOAD_LIMIT } from "@/lib/rate-limit";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET - Serve the book file from storage.
 * Default: the reading copy (EPUB) for the reader.
 * ?variant=original: the originally uploaded file (e.g. PDF) as an attachment, falling back to the reading copy.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const rateLimited = checkRateLimit(request, "download", DOWNLOAD_LIMIT);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (!id || id.length > 100) {
    return new NextResponse(null, { status: 400 });
  }

  const book = await prisma.book.findUnique({
    where: { id },
    select: { fileUrl: true, originalFileUrl: true },
  });

  if (!book?.fileUrl) {
    return new NextResponse(null, { status: 404 });
  }

  const wantsOriginal = request.nextUrl.searchParams.get("variant") === "original";
  const ref = wantsOriginal ? book.originalFileUrl || book.fileUrl : book.fileUrl;

  try {
    const file = await openStoredFile(ref);
    if (!file) {
      return new NextResponse(null, { status: 404 });
    }

    const headers: Record<string, string> = {
      "Content-Type": wantsOriginal ? file.contentType : "application/epub+zip",
      "Content-Length": String(file.size),
      "Cache-Control": "private, max-age=3600",
    };
    if (wantsOriginal) {
      headers["Content-Disposition"] = contentDisposition(file.key);
    }

    return new NextResponse(file.stream, { status: 200, headers });
  } catch (error) {
    console.error("Book download error:", error);
    return new NextResponse(null, { status: 404 });
  }
}

/** Attachment header with the original filename (the "<timestamp>_" key prefix removed). */
function contentDisposition(key: string): string {
  const name = (key.split("/").pop() || "book").replace(/^\d+_/, "");
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** POST - Increment download counter (used by the download button). */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;

  const rateLimited = checkRateLimit(request, "download", DOWNLOAD_LIMIT);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  await prisma.book.update({
    where: { id },
    data: { downloadCount: { increment: 1 } },
  });

  return NextResponse.json({ success: true });
}
