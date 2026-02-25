import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ token: string }> };

/**
 * GET /api/shared/[token]
 * Public endpoint - no auth required.
 * Finds SharedLink by token, increments viewCount, returns book metadata.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { token } = await params;

  const sharedLink = await prisma.sharedLink.findUnique({
    where: { token },
    include: {
      book: {
        include: {
          categories: { include: { category: true } },
          topics: { include: { topic: true } },
          reviews: { select: { rating: true } },
          user: { select: { name: true } },
        },
      },
    },
  });

  if (!sharedLink) {
    return NextResponse.json(
      { error: "Megosztott link nem található" },
      { status: 404 }
    );
  }

  // Check if the link has expired
  if (sharedLink.expiresAt && sharedLink.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "A megosztott link lejárt" },
      { status: 404 }
    );
  }

  // Increment view count (fire-and-forget)
  prisma.sharedLink
    .update({
      where: { id: sharedLink.id },
      data: { viewCount: { increment: 1 } },
    })
    .catch(() => {});

  const { book } = sharedLink;

  // Calculate average rating
  const avgRating =
    book.reviews.length > 0
      ? Math.round(
          (book.reviews.reduce((sum, r) => sum + r.rating, 0) /
            book.reviews.length) *
            10
        ) / 10
      : 0;

  return NextResponse.json({
    bookId: book.id,
    title: book.title,
    author: book.author,
    description: book.description,
    coverUrl: book.coverUrl ? `/api/books/${book.id}/cover` : null,
    categories: book.categories.map((bc) => ({
      id: bc.category.id,
      name: bc.category.name,
      slug: bc.category.slug,
      color: bc.category.color,
    })),
    topics: book.topics.map((bt) => ({
      id: bt.topic.id,
      name: bt.topic.name,
      slug: bt.topic.slug,
      color: bt.topic.color,
    })),
    avgRating,
    reviewCount: book.reviews.length,
    uploaderName: book.user.name,
    viewCount: sharedLink.viewCount + 1,
    createdAt: sharedLink.createdAt,
  });
}
