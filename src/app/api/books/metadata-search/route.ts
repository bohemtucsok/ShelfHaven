import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { searchBookMetadata } from "@/lib/ebook/metadata-search";
import { downloadAndResizeCover } from "@/lib/ebook/cover-utils";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

const METADATA_LIMIT = { interval: 60 * 1000, maxRequests: 10 };

export async function POST(request: NextRequest) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;

  const rateLimited = checkRateLimit(request, "metadata-search", METADATA_LIMIT);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { title, author } = body as { title?: string; author?: string };

  if (!title || title.trim().length < 2) {
    return NextResponse.json(
      { error: "A cim megadasa kotelezo (min. 2 karakter)" },
      { status: 400 }
    );
  }

  // Get user's language preference
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { language: true },
  });

  const results = await searchBookMetadata(
    title.trim(),
    author?.trim() || undefined,
    user?.language || "hu"
  );

  return NextResponse.json({ results });
}

/**
 * POST /api/books/metadata-search/cover
 * Download and resize a cover image from an external URL.
 * Returns base64 data URL for preview.
 */
export async function PUT(request: NextRequest) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;

  const rateLimited = checkRateLimit(request, "metadata-search", METADATA_LIMIT);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { coverUrl } = body as { coverUrl?: string };

  if (!coverUrl) {
    return NextResponse.json({ error: "coverUrl kotelezo" }, { status: 400 });
  }

  const result = await downloadAndResizeCover(coverUrl);
  if (!result) {
    return NextResponse.json(
      { error: "Nem sikerult letolteni a boritokepet" },
      { status: 400 }
    );
  }

  const base64 = result.data.toString("base64");
  const dataUrl = `data:${result.contentType};base64,${base64}`;

  return NextResponse.json({ coverPreview: dataUrl });
}
