import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit, PROGRESS_LIMIT } from "@/lib/rate-limit";
import { z } from "zod";
import { createActivity } from "@/lib/activity";

type RouteParams = { params: Promise<{ bookId: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bookId } = await params;

  const progress = await prisma.readingProgress.findUnique({
    where: {
      userId_bookId: { userId: session.user.id, bookId },
    },
  });

  return NextResponse.json(progress || { percentage: 0, cfi: null, lastReadAt: null });
}

const updateSchema = z.object({
  cfi: z.string().max(2000).nullable().optional(),
  percentage: z.number().min(0).max(100),
  currentPage: z.number().int().nullable().optional(),
  totalPages: z.number().int().nullable().optional(),
  readingMinutes: z.number().int().min(0).max(60).optional(),
  // Client-side timestamp for cross-device conflict resolution.
  // If provided, the server only updates if this timestamp is newer than lastReadAt.
  clientUpdatedAt: z.string().datetime().optional(),
});

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;

  const rateLimited = checkRateLimit(request, "progress", PROGRESS_LIMIT);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bookId } = await params;
  const body = await request.json();
  const validated = updateSchema.parse(body);

  const { readingMinutes, clientUpdatedAt, ...progressData } = validated;

  // Check previous progress for conflict resolution and book_finished detection
  const previousProgress = await prisma.readingProgress.findUnique({
    where: { userId_bookId: { userId: session.user.id, bookId } },
    select: { percentage: true, lastReadAt: true },
  });

  // Cross-device conflict resolution: if client sends a timestamp that is
  // older than the server's lastReadAt, the server data is newer (another
  // device updated in the meantime). Return the server state without updating.
  if (clientUpdatedAt && previousProgress?.lastReadAt) {
    const clientTime = new Date(clientUpdatedAt).getTime();
    const serverTime = previousProgress.lastReadAt.getTime();
    if (clientTime < serverTime) {
      const serverProgress = await prisma.readingProgress.findUnique({
        where: { userId_bookId: { userId: session.user.id, bookId } },
      });
      return NextResponse.json({ ...serverProgress, conflict: true });
    }
  }

  const progress = await prisma.readingProgress.upsert({
    where: {
      userId_bookId: { userId: session.user.id, bookId },
    },
    update: {
      ...progressData,
      lastReadAt: new Date(),
      ...(readingMinutes && readingMinutes > 0
        ? { totalReadingMinutes: { increment: readingMinutes } }
        : {}),
    },
    create: {
      userId: session.user.id,
      bookId,
      ...progressData,
      totalReadingMinutes: readingMinutes || 0,
    },
  });

  // Create activity when book is finished (crosses 100%)
  if (validated.percentage >= 100 && (!previousProgress || previousProgress.percentage < 100)) {
    createActivity({
      userId: session.user.id,
      type: "book_finished",
      bookId,
    }).catch(() => {});
  }

  return NextResponse.json(progress);
}
