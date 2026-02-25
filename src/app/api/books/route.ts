import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toPublicUrl } from "@/lib/storage/minio";
import { Prisma } from "@/generated/prisma/client";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const topic = searchParams.get("topic");
  const search = searchParams.get("q");
  const author = searchParams.get("author");
  const format = searchParams.get("format");
  const dateRange = searchParams.get("dateRange");
  const minRating = searchParams.get("minRating");
  const status = searchParams.get("status");
  const sort = searchParams.get("sort") || "newest";
  const page = Math.max(parseInt(searchParams.get("page") || "1") || 1, 1);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20") || 20, 1), 100);
  const offset = (page - 1) * limit;

  const where: Prisma.BookWhereInput = status === "saved"
    ? { savedBooks: { some: { userId: session.user.id } } }
    : { OR: [{ userId: session.user.id }, { savedBooks: { some: { userId: session.user.id } } }] };

  if (category) {
    where.categories = { some: { category: { slug: category } } };
  }
  if (topic) {
    where.topics = { some: { topic: { slug: topic } } };
  }
  if (search) {
    where.AND = [
      { OR: [{ title: { contains: search } }, { author: { contains: search } }] },
    ];
  }
  if (author) {
    where.author = { contains: author };
  }
  if (format) {
    where.originalFormat = format.toLowerCase();
  }
  if (dateRange) {
    const now = new Date();
    let dateFrom: Date | undefined;
    if (dateRange === "week") dateFrom = new Date(now.getTime() - 7 * 86400000);
    else if (dateRange === "month") dateFrom = new Date(now.getTime() - 30 * 86400000);
    else if (dateRange === "year") dateFrom = new Date(now.getTime() - 365 * 86400000);
    if (dateFrom) {
      where.createdAt = { gte: dateFrom };
    }
  }
  if (minRating) {
    const min = parseInt(minRating);
    if (min >= 1 && min <= 5) {
      where.reviews = { some: { rating: { gte: min } } };
    }
  }
  if (status) {
    if (status === "unread") {
      where.readingProgress = { none: { userId: session.user.id } };
    } else if (status === "reading") {
      where.readingProgress = {
        some: { userId: session.user.id, percentage: { gt: 0, lt: 99 } },
      };
    } else if (status === "finished") {
      where.readingProgress = {
        some: { userId: session.user.id, percentage: { gte: 99 } },
      };
    }
  }

  // Sort options
  let orderBy: Prisma.BookOrderByWithRelationInput;
  switch (sort) {
    case "popular":
      orderBy = { viewCount: "desc" };
      break;
    case "most-liked":
      orderBy = { likes: { _count: "desc" } };
      break;
    case "title":
      orderBy = { title: "asc" };
      break;
    default:
      orderBy = { createdAt: "desc" };
  }

  const [books, total] = await Promise.all([
    prisma.book.findMany({
      where,
      include: {
        categories: { include: { category: true } },
        topics: { include: { topic: true } },
        readingProgress: {
          where: { userId: session.user.id },
          take: 1,
        },
        _count: { select: { likes: true, reviews: true } },
      },
      orderBy,
      skip: offset,
      take: limit,
    }),
    prisma.book.count({ where }),
  ]);

  // Extract distinct authors from the fetched books (avoid 3rd DB query)
  const authorSet = new Set<string>();
  books.forEach((b) => { if (b.author) authorSet.add(b.author); });
  const authors = Array.from(authorSet).sort();

  // Replace internal Docker URLs with browser-accessible URLs + ownership flags
  const booksWithProxiedCovers = books.map((book) => ({
    ...book,
    fileUrl: toPublicUrl(book.fileUrl),
    coverUrl: book.coverUrl ? `/api/books/${book.id}/cover` : null,
    isOwned: book.userId === session.user.id,
    isSaved: book.userId !== session.user.id,
  }));

  return NextResponse.json({
    books: booksWithProxiedCovers,
    authors,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
