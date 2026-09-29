import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readStoredFile, saveFile, deleteStoredFile } from "@/lib/storage";
import { checkRateLimit, PUBLIC_LIMIT, API_LIMIT } from "@/lib/rate-limit";
import { auth } from "@/lib/auth";
import { validateCsrf } from "@/lib/csrf";
import { resizeCover, generateBlurHash } from "@/lib/ebook/cover-utils";

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
    const file = await readStoredFile(book.coverUrl);
    if (!file) {
      return new NextResponse(null, { status: 404 });
    }

    return new NextResponse(new Uint8Array(file.data), {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (error) {
    console.error("Cover proxy error:", error);
    return new NextResponse(null, { status: 404 });
  }
}

const MAX_COVER_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: NextRequest, { params }: RouteParams) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;

  const limited = checkRateLimit(request, "api", API_LIMIT);
  if (limited) return limited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const book = await prisma.book.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, coverUrl: true },
  });

  if (!book) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("cover") as File | null;

    if (!file || !file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Invalid image" }, { status: 400 });
    }

    if (file.size > MAX_COVER_SIZE) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Resize and optimize
    const resized = await resizeCover(buffer);
    const blurHash = await generateBlurHash(resized);

    const timestamp = Date.now();
    const coverKey = `${session.user.id}/${timestamp}_cover.jpg`;
    const newCoverUrl = await saveFile("covers", coverKey, resized);

    // Delete old cover
    if (book.coverUrl) {
      try {
        await deleteStoredFile(book.coverUrl);
      } catch {
        // Silent fail
      }
    }

    await prisma.book.update({
      where: { id },
      data: {
        coverUrl: newCoverUrl,
        ...(blurHash && { blurHash }),
      },
    });

    return NextResponse.json({
      coverUrl: `/api/books/${id}/cover`,
      blurHash,
    });
  } catch (error) {
    console.error("Cover upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
