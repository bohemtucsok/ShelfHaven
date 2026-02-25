import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit, API_LIMIT } from "@/lib/rate-limit";

/**
 * POST /api/books/check-duplicate
 * Checks if the current user already has a book with matching title+author.
 * Body: { title: string, author?: string }
 * Returns: { duplicates: Array<{ id, title, author, coverUrl, createdAt }> }
 */
export async function POST(request: NextRequest) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;

  const limited = checkRateLimit(request, "api", API_LIMIT);
  if (limited) return limited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { title?: string; author?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { title, author } = body;
  if (!title || title.trim().length < 2) {
    return NextResponse.json({ duplicates: [] });
  }

  const normalizedTitle = title.trim().toLowerCase();

  // Search for books with similar title from this user
  const existing = await prisma.book.findMany({
    where: {
      userId: session.user.id,
      title: { contains: normalizedTitle },
      ...(author && author.trim().length > 1
        ? { author: { contains: author.trim().toLowerCase() } }
        : {}),
    },
    select: {
      id: true,
      title: true,
      author: true,
      coverUrl: true,
      originalFormat: true,
      createdAt: true,
    },
    take: 5,
  });

  // Filter for close matches (case-insensitive exact or very similar)
  const duplicates = existing.filter((book) => {
    const bookTitle = book.title.toLowerCase();
    // Exact match or one contains the other
    return (
      bookTitle === normalizedTitle ||
      bookTitle.includes(normalizedTitle) ||
      normalizedTitle.includes(bookTitle)
    );
  });

  // Proxy cover URLs
  const results = duplicates.map((book) => ({
    ...book,
    coverUrl: book.coverUrl ? `/api/books/${book.id}/cover` : null,
  }));

  return NextResponse.json({ duplicates: results });
}
