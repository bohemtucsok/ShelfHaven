import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit, API_LIMIT } from "@/lib/rate-limit";
import { z } from "zod";

const goalSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  targetBooks: z.number().int().min(1).max(1000),
  targetMinutes: z.number().int().min(0).max(1000000).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentYear = new Date().getFullYear();

  const goal = await prisma.readingGoal.findUnique({
    where: { userId_year: { userId: session.user.id, year: currentYear } },
  });

  // Current year progress
  const yearStart = new Date(currentYear, 0, 1);
  const [finishedBooks, readingTimeAgg] = await Promise.all([
    prisma.readingProgress.count({
      where: {
        userId: session.user.id,
        percentage: { gte: 99 },
        lastReadAt: { gte: yearStart },
      },
    }),
    prisma.readingProgress.aggregate({
      where: {
        userId: session.user.id,
        lastReadAt: { gte: yearStart },
      },
      _sum: { totalReadingMinutes: true },
    }),
  ]);

  return NextResponse.json({
    goal: goal
      ? {
          year: goal.year,
          targetBooks: goal.targetBooks,
          targetMinutes: goal.targetMinutes,
        }
      : null,
    progress: {
      booksFinished: finishedBooks,
      minutesRead: readingTimeAgg._sum.totalReadingMinutes || 0,
    },
  });
}

export async function POST(request: NextRequest) {
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
    const validated = goalSchema.parse(body);

    const goal = await prisma.readingGoal.upsert({
      where: {
        userId_year: { userId: session.user.id, year: validated.year },
      },
      update: {
        targetBooks: validated.targetBooks,
        targetMinutes: validated.targetMinutes ?? 0,
      },
      create: {
        userId: session.user.id,
        year: validated.year,
        targetBooks: validated.targetBooks,
        targetMinutes: validated.targetMinutes ?? 0,
      },
    });

    return NextResponse.json({
      goal: {
        year: goal.year,
        targetBooks: goal.targetBooks,
        targetMinutes: goal.targetMinutes,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
