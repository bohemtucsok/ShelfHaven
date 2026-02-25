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

  const [following, total] = await Promise.all([
    prisma.follow.findMany({
      where: { followerId: id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        following: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.follow.count({ where: { followerId: id } }),
  ]);

  const result = following.map((f) => ({
    id: f.following.id,
    name: f.following.name,
    avatarUrl: getGravatarUrl(f.following.email, 80),
    followedAt: f.createdAt,
  }));

  return NextResponse.json({ following: result, total });
}
