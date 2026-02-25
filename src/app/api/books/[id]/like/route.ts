import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit, API_LIMIT } from "@/lib/rate-limit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrf = validateCsrf(request);
    if (csrf) return csrf;

    const rateLimited = checkRateLimit(request, "like", API_LIMIT);
    if (rateLimited) return rateLimited;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: bookId } = await params;
    const userId = session.user.id;

    // Toggle: delete if exists, create if not
    const existing = await prisma.like.findUnique({
      where: { userId_bookId: { userId, bookId } },
    });

    if (existing) {
      await prisma.like.delete({
        where: { userId_bookId: { userId, bookId } },
      });
    } else {
      await prisma.like.create({
        data: { userId, bookId },
      });

      // Notify book owner about new like
      const book = await prisma.book.findUnique({
        where: { id: bookId },
        select: { userId: true, title: true },
      });
      if (book) {
        createNotification({
          userId: book.userId,
          type: "like",
          message: `${session.user.name || "Valaki"} kedvelte a(z) "${book.title}" könyved`,
          bookId,
          fromUserId: userId,
        }).catch(() => {});
      }
    }

    const totalLikes = await prisma.like.count({ where: { bookId } });

    return NextResponse.json({
      liked: !existing,
      totalLikes,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const { id: bookId } = await params;

  const totalLikes = await prisma.like.count({ where: { bookId } });

  let liked = false;
  if (session?.user?.id) {
    const existing = await prisma.like.findUnique({
      where: { userId_bookId: { userId: session.user.id, bookId } },
    });
    liked = !!existing;
  }

  return NextResponse.json({ liked, totalLikes });
}
