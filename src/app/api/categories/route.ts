import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit, ADMIN_LIMIT, PUBLIC_LIMIT } from "@/lib/rate-limit";
import { slugify } from "@/lib/utils";
import { z } from "zod";

export async function GET(request: NextRequest) {
  const limited = checkRateLimit(request, "public", PUBLIC_LIMIT);
  if (limited) return limited;

  const categories = await prisma.category.findMany({
    orderBy: { order: "asc" },
    include: { _count: { select: { books: true } } },
  });

  return NextResponse.json(categories, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  icon: z.string().max(50).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export async function POST(request: NextRequest) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;

  const limited = checkRateLimit(request, "admin", ADMIN_LIMIT);
  if (limited) return limited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  const body = await request.json();
  const validated = createSchema.parse(body);

  const category = await prisma.category.create({
    data: {
      ...validated,
      slug: slugify(validated.name),
    },
  });

  return NextResponse.json(category, { status: 201 });
}
