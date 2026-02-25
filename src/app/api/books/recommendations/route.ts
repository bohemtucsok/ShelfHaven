import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ recommendations: [] });
  }

  const bookId = request.nextUrl.searchParams.get("bookId");

  // Get user's highly-rated books (4-5 stars) to understand preferences
  const userRatings = await prisma.review.findMany({
    where: { userId: session.user.id, rating: { gte: 4 } },
    select: {
      book: {
        select: {
          id: true,
          author: true,
          categories: { select: { categoryId: true } },
          topics: { select: { topicId: true } },
        },
      },
    },
  });

  // If specific book context, get that book's metadata
  let contextBook: {
    id: string;
    author: string | null;
    categories: { categoryId: string }[];
    topics: { topicId: string }[];
  } | null = null;

  if (bookId) {
    contextBook = await prisma.book.findUnique({
      where: { id: bookId },
      select: {
        id: true,
        author: true,
        categories: { select: { categoryId: true } },
        topics: { select: { topicId: true } },
      },
    });
  }

  // Collect preferred category and topic IDs
  const preferredCategories = new Set<string>();
  const preferredTopics = new Set<string>();
  const preferredAuthors = new Set<string>();
  const excludeBookIds = new Set<string>();

  // Add user's own books to exclusion
  const userBookIds = await prisma.book.findMany({
    where: { userId: session.user.id },
    select: { id: true },
  });
  for (const b of userBookIds) excludeBookIds.add(b.id);

  // From ratings
  for (const r of userRatings) {
    excludeBookIds.add(r.book.id);
    if (r.book.author) preferredAuthors.add(r.book.author);
    for (const c of r.book.categories) preferredCategories.add(c.categoryId);
    for (const t of r.book.topics) preferredTopics.add(t.topicId);
  }

  // From context book
  if (contextBook) {
    excludeBookIds.add(contextBook.id);
    if (contextBook.author) preferredAuthors.add(contextBook.author);
    for (const c of contextBook.categories) preferredCategories.add(c.categoryId);
    for (const t of contextBook.topics) preferredTopics.add(t.topicId);
  }

  // If no preferences at all, return empty
  if (preferredCategories.size === 0 && preferredTopics.size === 0 && preferredAuthors.size === 0) {
    return NextResponse.json({ recommendations: [] });
  }

  // Find candidate books from other users
  const candidates = await prisma.book.findMany({
    where: {
      id: { notIn: Array.from(excludeBookIds) },
      userId: { not: session.user.id },
      OR: [
        ...(preferredCategories.size > 0
          ? [{ categories: { some: { categoryId: { in: Array.from(preferredCategories) } } } }]
          : []),
        ...(preferredTopics.size > 0
          ? [{ topics: { some: { topicId: { in: Array.from(preferredTopics) } } } }]
          : []),
        ...(preferredAuthors.size > 0
          ? [{ author: { in: Array.from(preferredAuthors) } }]
          : []),
      ],
    },
    select: {
      id: true,
      title: true,
      author: true,
      coverUrl: true,
      categories: { select: { categoryId: true } },
      topics: { select: { topicId: true } },
      reviews: { select: { rating: true } },
    },
    take: 50,
  });

  // Score candidates
  const scored = candidates.map((book) => {
    let score = 0;
    // Category matches
    for (const c of book.categories) {
      if (preferredCategories.has(c.categoryId)) score += 3;
    }
    // Topic matches
    for (const t of book.topics) {
      if (preferredTopics.has(t.topicId)) score += 2;
    }
    // Author match
    if (book.author && preferredAuthors.has(book.author)) score += 5;
    // Rating bonus
    if (book.reviews.length > 0) {
      const avg = book.reviews.reduce((s, r) => s + r.rating, 0) / book.reviews.length;
      score += avg;
    }
    return { book, score };
  });

  // Sort by score descending, take top 6
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 6);

  return NextResponse.json({
    recommendations: top.map(({ book }) => ({
      id: book.id,
      title: book.title,
      author: book.author,
      coverUrl: book.coverUrl ? `/api/books/${book.id}/cover` : null,
      avgRating:
        book.reviews.length > 0
          ? Math.round((book.reviews.reduce((s, r) => s + r.rating, 0) / book.reviews.length) * 10) / 10
          : null,
    })),
  });
}
