import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateReadingStreak, groupByMonth, groupByWeekday } from "@/lib/stats-utils";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Parallel queries for performance
  const [
    totalBooks,
    finishedBooks,
    progressAgg,
    readingTimeAgg,
    allProgress,
    booksWithDates,
    categoryStats,
    recentlyFinished,
  ] = await Promise.all([
    // Total books
    prisma.book.count({ where: { userId } }),
    // Finished books (>=99%)
    prisma.readingProgress.count({
      where: { userId, percentage: { gte: 99 } },
    }),
    // Average progress
    prisma.readingProgress.aggregate({
      where: { userId },
      _avg: { percentage: true },
    }),
    // Total reading time
    prisma.readingProgress.aggregate({
      where: { userId },
      _sum: { totalReadingMinutes: true },
    }),
    // All progress entries for streak + weekday analysis
    prisma.readingProgress.findMany({
      where: { userId },
      select: { lastReadAt: true, totalReadingMinutes: true },
      orderBy: { lastReadAt: "desc" },
    }),
    // Books with creation dates for monthly chart
    prisma.book.findMany({
      where: { userId },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    // Category stats
    prisma.readingProgress.findMany({
      where: { userId },
      select: {
        book: {
          select: {
            categories: {
              select: { category: { select: { name: true } } },
            },
          },
        },
      },
    }),
    // Recently finished books
    prisma.readingProgress.findMany({
      where: { userId, percentage: { gte: 99 } },
      orderBy: { lastReadAt: "desc" },
      take: 5,
      include: {
        book: {
          select: { id: true, title: true, author: true, coverUrl: true },
        },
      },
    }),
  ]);

  // Reading streak
  const readingStreak = calculateReadingStreak(allProgress.map((a) => a.lastReadAt));

  // Monthly books uploaded (last 12 months)
  const monthlyBooks = groupByMonth(booksWithDates);

  // Weekly activity (minutes per day of week)
  const weeklyActivity = groupByWeekday(allProgress);

  // Category distribution
  const catCounts = new Map<string, number>();
  for (const rp of categoryStats) {
    for (const bc of rp.book.categories) {
      catCounts.set(bc.category.name, (catCounts.get(bc.category.name) || 0) + 1);
    }
  }
  const categoryDistribution = Array.from(catCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }));

  // Total reading minutes
  const totalMinutes = readingTimeAgg._sum.totalReadingMinutes || 0;

  // Average minutes per day (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
  const recentProgress = allProgress.filter((a) => a.lastReadAt >= thirtyDaysAgo);
  const recentMinutes = recentProgress.reduce((sum, a) => sum + a.totalReadingMinutes, 0);
  const avgMinutesPerDay = Math.round(recentMinutes / 30);

  return NextResponse.json({
    summary: {
      totalBooks,
      finishedBooks,
      averageProgress: Math.round(progressAgg._avg.percentage || 0),
      totalMinutes,
      readingStreak,
      avgMinutesPerDay,
    },
    monthlyBooks,
    weeklyActivity,
    categoryDistribution,
    recentlyFinished: recentlyFinished.map((rp) => ({
      bookId: rp.book.id,
      title: rp.book.title,
      author: rp.book.author,
      coverUrl: rp.book.coverUrl ? `/api/books/${rp.book.id}/cover` : null,
      finishedAt: rp.lastReadAt,
    })),
  });
}
