import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit, API_LIMIT } from "@/lib/rate-limit";
import { createActivity } from "@/lib/activity";
import { z } from "zod";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shelves = await prisma.shelf.findMany({
    where: { userId: session.user.id },
    orderBy: { order: "asc" },
    include: {
      books: {
        orderBy: { position: "asc" },
        include: {
          book: {
            include: {
              categories: { include: { category: true } },
              topics: { include: { topic: true } },
            },
          },
        },
      },
      _count: { select: { books: true } },
    },
  });

  // Replace direct MinIO cover URLs with proxy URLs
  const shelvesWithProxiedCovers = shelves.map((shelf) => ({
    ...shelf,
    books: shelf.books.map((sb) => ({
      ...sb,
      book: {
        ...sb.book,
        coverUrl: sb.book.coverUrl ? `/api/books/${sb.book.id}/cover` : null,
      },
    })),
  }));

  return NextResponse.json(shelvesWithProxiedCovers);
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;

  const limited = checkRateLimit(request, "api", API_LIMIT);
  if (limited) return limited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const validated = createSchema.parse(body);

  const maxOrder = await prisma.shelf.findFirst({
    where: { userId: session.user.id },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const shelf = await prisma.shelf.create({
    data: {
      ...validated,
      userId: session.user.id,
      order: (maxOrder?.order ?? -1) + 1,
    },
  });

  createActivity({
    userId: session.user.id,
    type: "shelf_created",
    metadata: { shelfName: shelf.name },
  }).catch(() => {});

  return NextResponse.json(shelf, { status: 201 });
}
