import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { createActivity } from "@/lib/activity";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit, API_LIMIT } from "@/lib/rate-limit";
import { z } from "zod";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookId } = await params;

  const reviews = await prisma.review.findMany({
    where: { bookId },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(reviews);
}

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  text: z.string().max(5000).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrf = validateCsrf(request);
    if (csrf) return csrf;

    const limited = checkRateLimit(request, "api", API_LIMIT);
    if (limited) return limited;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: bookId } = await params;
    const body = await request.json();
    const validated = reviewSchema.parse(body);
    const { rating, text } = validated;

    // Check if user already reviewed this book
    const existing = await prisma.review.findUnique({
      where: { userId_bookId: { userId: session.user.id, bookId } },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Már értékelted ezt a könyvet" },
        { status: 409 }
      );
    }

    const review = await prisma.review.create({
      data: {
        userId: session.user.id,
        bookId,
        rating,
        text: text || null,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    // Notify book owner
    const book = await prisma.book.findUnique({
      where: { id: bookId },
      select: { userId: true, title: true },
    });
    if (book) {
      createNotification({
        userId: book.userId,
        type: "review",
        message: `${session.user.name || "Valaki"} ${rating} csillagra értékelte a(z) "${book.title}" könyved`,
        bookId,
        fromUserId: session.user.id,
      }).catch(() => {});
    }

    createActivity({
      userId: session.user.id,
      type: "review_posted",
      bookId,
      metadata: { rating },
    }).catch(() => {});

    return NextResponse.json(review, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
