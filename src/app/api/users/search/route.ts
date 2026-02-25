import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getGravatarUrl } from "@/lib/gravatar";
import { checkRateLimit, API_LIMIT } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const rateLimited = checkRateLimit(request, "user-search", API_LIMIT);
  if (rateLimited) return rateLimited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const limit = Math.min(20, Math.max(1, parseInt(url.searchParams.get("limit") || "10")));

  if (!q || q.length < 2) {
    return NextResponse.json({ users: [] });
  }

  const users = await prisma.user.findMany({
    where: {
      name: { contains: q },
      id: { not: session.user.id },
    },
    select: { id: true, name: true, email: true, _count: { select: { books: true } } },
    take: limit,
  });

  const result = users.map((u) => ({
    id: u.id,
    name: u.name,
    avatarUrl: getGravatarUrl(u.email, 80),
    bookCount: u._count.books,
  }));

  return NextResponse.json({ users: result });
}
