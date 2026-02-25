import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getFile } from "@/lib/storage/minio";
import { checkRateLimit, PUBLIC_LIMIT } from "@/lib/rate-limit";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const limited = checkRateLimit(request, "cover", PUBLIC_LIMIT);
  if (limited) return limited;

  const { id } = await params;

  // Validate book ID format: must be non-empty and reasonable length (CUID format)
  if (!id || id.length > 100) {
    return new NextResponse(null, { status: 400 });
  }

  const book = await prisma.book.findUnique({
    where: { id },
    select: { coverUrl: true },
  });

  if (!book?.coverUrl) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    // Extract the key from the stored URL
    // URL format: http://minio:9000/covers/userId/timestamp_cover_filename.jpg
    // or: http://localhost:9000/covers/userId/timestamp_cover_filename.jpg
    const url = new URL(book.coverUrl);
    const pathParts = url.pathname.split("/");
    // pathParts: ["", "covers", "userId", "timestamp_cover_filename.jpg"]
    const bucket = pathParts[1]; // "covers"
    const key = pathParts.slice(2).join("/"); // "userId/timestamp_cover_filename.jpg"

    const response = await getFile(bucket, key);

    if (!response.Body) {
      return new NextResponse(null, { status: 404 });
    }

    const bodyBytes = await response.Body.transformToByteArray();

    return new NextResponse(Buffer.from(bodyBytes), {
      status: 200,
      headers: {
        "Content-Type": response.ContentType || "image/jpeg",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (error) {
    console.error("Cover proxy error:", error);
    return new NextResponse(null, { status: 404 });
  }
}
