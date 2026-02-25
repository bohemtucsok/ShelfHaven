import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit, API_LIMIT } from "@/lib/rate-limit";
import { z } from "zod";
import { getGravatarUrl } from "@/lib/gravatar";

const commentSchema = z.object({
  content: z.string().min(1).max(2000),
  parentId: z.string().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookId } = await params;
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20")));

  const [comments, total] = await Promise.all([
    prisma.comment.findMany({
      where: { bookId, parentId: null },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: { select: { id: true, name: true, email: true } },
        replies: {
          orderBy: { createdAt: "asc" },
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        _count: { select: { replies: true } },
      },
    }),
    prisma.comment.count({ where: { bookId, parentId: null } }),
  ]);

  // Map to add avatarUrl and remove email
  const mapped = comments.map((c) => ({
    ...c,
    user: { id: c.user.id, name: c.user.name, avatarUrl: getGravatarUrl(c.user.email, 80) },
    replies: c.replies.map((r) => ({
      ...r,
      user: { id: r.user.id, name: r.user.name, avatarUrl: getGravatarUrl(r.user.email, 80) },
    })),
  }));

  return NextResponse.json({ comments: mapped, total });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrf = validateCsrf(request);
    if (csrf) return csrf;

    const rateLimited = checkRateLimit(request, "comment", API_LIMIT);
    if (rateLimited) return rateLimited;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: bookId } = await params;
    const body = await request.json();
    const parsed = commentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { content, parentId } = parsed.data;

    // If reply, validate parent exists and belongs to same book, max 1 level
    if (parentId) {
      const parent = await prisma.comment.findUnique({
        where: { id: parentId },
        select: { bookId: true, parentId: true },
      });
      if (!parent || parent.bookId !== bookId || parent.parentId !== null) {
        return NextResponse.json({ error: "Invalid parent comment" }, { status: 400 });
      }
    }

    const comment = await prisma.comment.create({
      data: { userId: session.user.id, bookId, content, parentId },
      include: {
        user: { select: { id: true, name: true, email: true } },
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
        type: "comment",
        message: `${session.user.name || "Valaki"} hozzászólt a(z) "${book.title}" könyvedhez`,
        bookId,
        fromUserId: session.user.id,
      }).catch(() => {});
    }

    // If reply, also notify parent comment author
    if (parentId) {
      const parentComment = await prisma.comment.findUnique({
        where: { id: parentId },
        select: { userId: true },
      });
      if (parentComment && parentComment.userId !== session.user.id) {
        createNotification({
          userId: parentComment.userId,
          type: "comment_reply",
          message: `${session.user.name || "Valaki"} válaszolt a hozzászólásodra`,
          bookId,
          fromUserId: session.user.id,
        }).catch(() => {});
      }
    }

    return NextResponse.json({
      ...comment,
      user: { id: comment.user.id, name: comment.user.name, avatarUrl: getGravatarUrl(comment.user.email, 80) },
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
