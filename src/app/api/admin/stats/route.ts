import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";

export async function GET() {
  const { error, status } = await requireAdmin();
  if (error) return NextResponse.json({ error }, { status });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalUsers,
    totalBooks,
    totalReviews,
    newUsersThisMonth,
    newBooksThisMonth,
    storageResult,
    activeReaderGroups,
    platformReadingTime,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.book.count(),
    prisma.review.count(),
    prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.book.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.book.aggregate({ _sum: { fileSize: true } }),
    prisma.readingProgress.groupBy({
      by: ["userId"],
      where: { lastReadAt: { gte: monthStart } },
    }),
    prisma.readingProgress.aggregate({
      _sum: { totalReadingMinutes: true },
    }),
  ]);

  const storageUsedBytes = storageResult._sum.fileSize || 0;
  const storageUsedMB = Math.round(storageUsedBytes / (1024 * 1024));

  // Most popular books (by unique readers)
  const popularBooksRaw = await prisma.readingProgress.groupBy({
    by: ["bookId"],
    _count: { userId: true },
    orderBy: { _count: { userId: "desc" } },
    take: 5,
  });

  const popularBookIds = popularBooksRaw.map((b) => b.bookId);
  const popularBookDetails = popularBookIds.length > 0
    ? await prisma.book.findMany({
        where: { id: { in: popularBookIds } },
        select: { id: true, title: true, author: true },
      })
    : [];

  const popularBooks = popularBooksRaw.map((b) => {
    const book = popularBookDetails.find((d) => d.id === b.bookId);
    return {
      title: book?.title || "Ismeretlen",
      author: book?.author || "",
      readers: b._count.userId,
    };
  });

  return NextResponse.json({
    totalUsers,
    totalBooks,
    totalReviews,
    newUsersThisMonth,
    newBooksThisMonth,
    storageUsedMB,
    activeReadersThisMonth: activeReaderGroups.length,
    totalPlatformReadingMinutes: platformReadingTime._sum.totalReadingMinutes || 0,
    popularBooks,
  });
}
