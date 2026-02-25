import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { checkRateLimit, PUBLIC_LIMIT } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const limited = checkRateLimit(request, "public", PUBLIC_LIMIT);
  if (limited) return limited;

  const session = await auth();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Trending: most liked books in last 7 days
  const trendingLikes = await prisma.like.groupBy({
    by: ["bookId"],
    where: { createdAt: { gte: sevenDaysAgo } },
    _count: { bookId: true },
    orderBy: { _count: { bookId: "desc" } },
    take: 10,
  });

  const trendingBooks = trendingLikes.length > 0
    ? await prisma.book.findMany({
        where: { id: { in: trendingLikes.map((l) => l.bookId) } },
        select: { id: true, title: true, author: true, coverUrl: true, userId: true, _count: { select: { likes: true } } },
      })
    : [];

  const trending = trendingLikes.map((l) => {
    const book = trendingBooks.find((b) => b.id === l.bookId);
    return book ? {
      id: book.id,
      title: book.title,
      author: book.author,
      coverUrl: book.coverUrl ? `/api/books/${book.id}/cover` : null,
      userId: book.userId,
      likes: l._count.bookId,
    } : null;
  }).filter(Boolean);

  // New arrivals: newest uploads (top 10)
  const newArrivals = await prisma.book.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, title: true, author: true, coverUrl: true, userId: true, createdAt: true },
  });

  // Top rated: best average rating (min 2 reviews)
  const topRatedRaw = await prisma.review.groupBy({
    by: ["bookId"],
    _avg: { rating: true },
    _count: { bookId: true },
    having: { bookId: { _count: { gte: 2 } } },
    orderBy: { _avg: { rating: "desc" } },
    take: 10,
  });

  const topRatedBooks = topRatedRaw.length > 0
    ? await prisma.book.findMany({
        where: { id: { in: topRatedRaw.map((r) => r.bookId) } },
        select: { id: true, title: true, author: true, coverUrl: true, userId: true },
      })
    : [];

  const topRated = topRatedRaw.map((r) => {
    const book = topRatedBooks.find((b) => b.id === r.bookId);
    return book ? {
      id: book.id,
      title: book.title,
      author: book.author,
      coverUrl: book.coverUrl ? `/api/books/${book.id}/cover` : null,
      userId: book.userId,
      avgRating: Math.round((r._avg.rating || 0) * 10) / 10,
      reviewCount: r._count.bookId,
    } : null;
  }).filter(Boolean);

  // Recently finished by others (auth only)
  let recentlyFinished: Array<{
    id: string;
    title: string;
    author: string | null;
    coverUrl: string | null;
    userId: string;
    finishedBy: number;
  }> = [];

  if (session?.user?.id) {
    const finishedRaw = await prisma.readingProgress.groupBy({
      by: ["bookId"],
      where: {
        percentage: { gte: 100 },
        lastReadAt: { gte: sevenDaysAgo },
        userId: { not: session.user.id },
      },
      _count: { bookId: true },
      orderBy: { _count: { bookId: "desc" } },
      take: 10,
    });

    if (finishedRaw.length > 0) {
      const finishedBooks = await prisma.book.findMany({
        where: { id: { in: finishedRaw.map((f) => f.bookId) } },
        select: { id: true, title: true, author: true, coverUrl: true, userId: true },
      });

      recentlyFinished = finishedRaw.map((f) => {
        const book = finishedBooks.find((b) => b.id === f.bookId);
        return book ? {
          id: book.id,
          title: book.title,
          author: book.author,
          coverUrl: book.coverUrl ? `/api/books/${book.id}/cover` : null,
          userId: book.userId,
          finishedBy: f._count.bookId,
        } : null;
      }).filter((x): x is NonNullable<typeof x> => x !== null);
    }
  }

  // Category highlights: top 3 categories with their books
  const topCategories = await prisma.category.findMany({
    orderBy: { books: { _count: "desc" } },
    take: 3,
    select: {
      id: true,
      name: true,
      slug: true,
      icon: true,
      books: {
        take: 6,
        orderBy: { book: { createdAt: "desc" } },
        select: {
          book: {
            select: { id: true, title: true, author: true, coverUrl: true, userId: true },
          },
        },
      },
    },
  });

  const categoryHighlights = topCategories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    icon: cat.icon,
    books: cat.books.map((b) => ({
      id: b.book.id,
      title: b.book.title,
      author: b.book.author,
      coverUrl: b.book.coverUrl ? `/api/books/${b.book.id}/cover` : null,
      userId: b.book.userId,
    })),
  }));

  return NextResponse.json({
    trending,
    newArrivals: newArrivals.map((b) => ({
      ...b,
      coverUrl: b.coverUrl ? `/api/books/${b.id}/cover` : null,
      userId: b.userId,
    })),
    topRated,
    recentlyFinished,
    categoryHighlights,
  });
}
