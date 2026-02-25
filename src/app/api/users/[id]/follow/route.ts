import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";
import { createActivity } from "@/lib/activity";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit, API_LIMIT } from "@/lib/rate-limit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrf = validateCsrf(request);
    if (csrf) return csrf;

    const rateLimited = checkRateLimit(request, "follow", API_LIMIT);
    if (rateLimited) return rateLimited;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: followingId } = await params;
    const followerId = session.user.id;

    // Cannot follow yourself
    if (followerId === followingId) {
      return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
    }

    // Check target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: followingId },
      select: { id: true, name: true },
    });
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Toggle: delete if exists, create if not
    const existing = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });

    if (existing) {
      await prisma.follow.delete({
        where: { followerId_followingId: { followerId, followingId } },
      });
    } else {
      await prisma.follow.create({
        data: { followerId, followingId },
      });

      createNotification({
        userId: followingId,
        type: "follow",
        message: `${session.user.name || "Valaki"} elkezdte követni a profilodat`,
        fromUserId: followerId,
      }).catch(() => {});

      createActivity({
        userId: followerId,
        type: "started_following",
        targetUserId: followingId,
      }).catch(() => {});
    }

    const followerCount = await prisma.follow.count({ where: { followingId } });

    return NextResponse.json({
      following: !existing,
      followerCount,
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
  const { id: userId } = await params;

  const [followerCount, followingCount] = await Promise.all([
    prisma.follow.count({ where: { followingId: userId } }),
    prisma.follow.count({ where: { followerId: userId } }),
  ]);

  let following = false;
  if (session?.user?.id && session.user.id !== userId) {
    const existing = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: session.user.id, followingId: userId } },
    });
    following = !!existing;
  }

  return NextResponse.json({ following, followerCount, followingCount });
}
