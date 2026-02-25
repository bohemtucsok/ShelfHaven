import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGravatarUrl } from "@/lib/gravatar";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit, API_LIMIT } from "@/lib/rate-limit";
import { calculateReadingStreak } from "@/lib/stats-utils";
import { z } from "zod";

const SUPPORTED_LANGUAGES = ["hu", "en"] as const;

const SUPPORTED_THEMES = ["light", "dark", "system"] as const;
const SUPPORTED_VIEWS = ["shelf", "grid"] as const;

const updateSchema = z.object({
  name: z.string().min(2, "A név legalább 2 karakter legyen").max(100).optional(),
  language: z.enum(SUPPORTED_LANGUAGES).optional(),
  theme: z.enum(SUPPORTED_THEMES).optional(),
  defaultView: z.enum(SUPPORTED_VIEWS).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, image: true, language: true, theme: true, defaultView: true, createdAt: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Felhasználó nem található" }, { status: 404 });
  }

  const totalBooks = await prisma.book.count({
    where: { userId: session.user.id },
  });

  // Format breakdown
  const books = await prisma.book.findMany({
    where: { userId: session.user.id },
    select: { originalFormat: true },
  });

  const formatMap = new Map<string, number>();
  for (const book of books) {
    const fmt = book.originalFormat.toUpperCase();
    formatMap.set(fmt, (formatMap.get(fmt) || 0) + 1);
  }
  const formatBreakdown = Array.from(formatMap.entries()).map(([format, count]) => ({ format, count }));

  // Average reading progress + reading time
  const [progressAgg, readingTimeAgg, finishedBooks] = await Promise.all([
    prisma.readingProgress.aggregate({
      where: { userId: session.user.id },
      _avg: { percentage: true },
    }),
    prisma.readingProgress.aggregate({
      where: { userId: session.user.id },
      _sum: { totalReadingMinutes: true },
    }),
    prisma.readingProgress.count({
      where: { userId: session.user.id, percentage: { gte: 99 } },
    }),
  ]);

  // Reading streak (consecutive days with activity)
  const activityDates = await prisma.readingProgress.findMany({
    where: { userId: session.user.id },
    select: { lastReadAt: true },
    orderBy: { lastReadAt: "desc" },
  });
  const readingStreak = calculateReadingStreak(activityDates.map((a) => a.lastReadAt));

  // Top categories by reading activity
  const categoryStats = await prisma.readingProgress.findMany({
    where: { userId: session.user.id },
    select: {
      book: {
        select: {
          categories: {
            select: { category: { select: { name: true } } },
          },
        },
      },
    },
  });
  const catCounts = new Map<string, number>();
  for (const rp of categoryStats) {
    for (const bc of rp.book.categories) {
      catCounts.set(bc.category.name, (catCounts.get(bc.category.name) || 0) + 1);
    }
  }
  const topCategories = Array.from(catCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  // Follower/following counts
  const [followersCount, followingCount] = await Promise.all([
    prisma.follow.count({ where: { followingId: session.user.id } }),
    prisma.follow.count({ where: { followerId: session.user.id } }),
  ]);

  // Recent reading activity
  const recentActivity = await prisma.readingProgress.findMany({
    where: { userId: session.user.id },
    orderBy: { lastReadAt: "desc" },
    take: 5,
    include: {
      book: {
        select: { id: true, title: true, author: true, coverUrl: true },
      },
    },
  });

  return NextResponse.json({
    user: { ...user, avatarUrl: getGravatarUrl(user.email, 160) },
    stats: {
      totalBooks,
      averageProgress: progressAgg._avg.percentage || 0,
      formatBreakdown,
      finishedBooks,
      totalReadingMinutes: readingTimeAgg._sum.totalReadingMinutes || 0,
      readingStreak,
      categoryStats: topCategories,
      followersCount,
      followingCount,
    },
    recentActivity: recentActivity.map((rp) => ({
      bookId: rp.book.id,
      bookTitle: rp.book.title,
      bookAuthor: rp.book.author,
      bookCoverUrl: rp.book.coverUrl ? `/api/books/${rp.book.id}/cover` : null,
      percentage: rp.percentage,
      lastReadAt: rp.lastReadAt,
    })),
  });
}

export async function PUT(request: NextRequest) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;

  const limited = checkRateLimit(request, "api", API_LIMIT);
  if (limited) return limited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validated = updateSchema.parse(body);

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { ...validated },
      select: { id: true, name: true, email: true, image: true, language: true, theme: true, defaultView: true, createdAt: true },
    });

    return NextResponse.json({ user: { ...user, avatarUrl: getGravatarUrl(user.email, 160) } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: "Hiba történt" }, { status: 500 });
  }
}
