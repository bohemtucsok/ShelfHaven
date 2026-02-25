import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getGravatarUrl } from "@/lib/gravatar";
import { checkRateLimit, PUBLIC_LIMIT } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const limited = checkRateLimit(request, "public", PUBLIC_LIMIT);
  if (limited) return limited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("filter") || "all";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));
  const skip = (page - 1) * limit;

  let userIds: string[] | undefined;

  if (filter === "following" && session?.user?.id) {
    const follows = await prisma.follow.findMany({
      where: { followerId: session.user.id },
      select: { followingId: true },
    });
    userIds = follows.map((f) => f.followingId);
    if (userIds.length === 0) {
      return NextResponse.json({ activities: [], total: 0 });
    }
  }

  const where = userIds ? { userId: { in: userIds } } : {};

  const [activities, total] = await Promise.all([
    prisma.activity.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        user: { select: { id: true, name: true, email: true } },
        book: { select: { id: true, title: true, coverUrl: true } },
        targetUser: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.activity.count({ where }),
  ]);

  const mapped = activities.map((a) => ({
    id: a.id,
    type: a.type,
    metadata: a.metadata,
    createdAt: a.createdAt.toISOString(),
    user: {
      id: a.user.id,
      name: a.user.name,
      avatarUrl: getGravatarUrl(a.user.email, 40),
    },
    book: a.book
      ? {
          id: a.book.id,
          title: a.book.title,
          coverUrl: a.book.coverUrl ? `/api/books/${a.book.id}/cover` : null,
        }
      : null,
    targetUser: a.targetUser
      ? {
          id: a.targetUser.id,
          name: a.targetUser.name,
          avatarUrl: getGravatarUrl(a.targetUser.email, 40),
        }
      : null,
  }));

  return NextResponse.json({ activities: mapped, total });
}
