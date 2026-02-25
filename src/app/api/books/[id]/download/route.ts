import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFile } from "@/lib/storage/minio";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit, DOWNLOAD_LIMIT } from "@/lib/rate-limit";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET - Proxy the EPUB file from MinIO (used by the reader).
 * This avoids exposing MinIO directly to the browser and CSP issues.
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
    select: { fileUrl: true },
  });

  if (!book?.fileUrl) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const url = new URL(book.fileUrl);
    const pathParts = url.pathname.split("/");
    const bucket = pathParts[1]; // "ebooks"
    const key = pathParts.slice(2).join("/");

    const response = await getFile(bucket, key);

    if (!response.Body) {
      return new NextResponse(null, { status: 404 });
    }

    const bodyBytes = await response.Body.transformToByteArray();

    return new NextResponse(Buffer.from(bodyBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/epub+zip",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Book download proxy error:", error);
    return new NextResponse(null, { status: 404 });
  }
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
