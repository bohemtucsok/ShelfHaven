import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";

export async function GET(request: NextRequest) {
  const { error, status } = await requireAdmin();
  if (error) return NextResponse.json({ error }, { status });

  const url = new URL(request.url);
  const page = Math.max(parseInt(url.searchParams.get("page") || "1") || 1, 1);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "20") || 20, 1), 100);
  const q = url.searchParams.get("q") || "";
  const skip = (page - 1) * limit;

  const where = q
    ? {
        OR: [
          { title: { contains: q } },
          { author: { contains: q } },
        ],
      }
    : {};

  const [books, total] = await Promise.all([
    prisma.book.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        author: true,
        originalFormat: true,
        fileSize: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.book.count({ where }),
  ]);

  return NextResponse.json({ books, total, page });
}
