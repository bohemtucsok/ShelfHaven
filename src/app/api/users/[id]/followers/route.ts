import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getGravatarUrl } from "@/lib/gravatar";
import { checkRateLimit, PUBLIC_LIMIT } from "@/lib/rate-limit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = checkRateLimit(request, "public", PUBLIC_LIMIT);
  if (limited) return limited;

  const { id } = await params;
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20")));

  const [followers, total] = await Promise.all([
    prisma.follow.findMany({
      where: { followingId: id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        follower: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.follow.count({ where: { followingId: id } }),
  ]);

  const result = followers.map((f) => ({
    id: f.follower.id,
    name: f.follower.name,
    avatarUrl: getGravatarUrl(f.follower.email, 80),
    followedAt: f.createdAt,
  }));

  return NextResponse.json({ followers: result, total });
}
