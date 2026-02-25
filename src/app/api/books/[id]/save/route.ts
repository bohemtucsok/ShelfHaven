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

    const rateLimited = checkRateLimit(request, "save", API_LIMIT);
    if (rateLimited) return rateLimited;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: bookId } = await params;
    const userId = session.user.id;

    // Check if book exists and get owner
    const book = await prisma.book.findUnique({
      where: { id: bookId },
      select: { userId: true, title: true },
    });

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Cannot save own book
    if (book.userId === userId) {
      return NextResponse.json({ error: "Cannot save your own book" }, { status: 400 });
    }

    // Toggle: delete if exists, create if not
    const existing = await prisma.savedBook.findUnique({
      where: { userId_bookId: { userId, bookId } },
    });

    if (existing) {
      await prisma.savedBook.delete({
        where: { userId_bookId: { userId, bookId } },
      });
    } else {
      await prisma.savedBook.create({
        data: { userId, bookId },
      });

      // Notify book owner
      createNotification({
        userId: book.userId,
        type: "book_saved",
        message: `${session.user.name || "Valaki"} mentette a(z) "${book.title}" könyved a könyvtárába`,
        bookId,
        fromUserId: userId,
      }).catch(() => {});

      // Create activity entry
      prisma.activity.create({
        data: {
          userId,
          type: "book_saved",
          bookId,
          targetUserId: book.userId,
        },
      }).catch(() => {});
    }

    return NextResponse.json({
      saved: !existing,
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const { id: bookId } = await params;

  let saved = false;
  if (session?.user?.id) {
    const existing = await prisma.savedBook.findUnique({
      where: { userId_bookId: { userId: session.user.id, bookId } },
    });
    saved = !!existing;
  }

  return NextResponse.json({ saved });
}
