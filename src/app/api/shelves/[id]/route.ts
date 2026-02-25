import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit, API_LIMIT } from "@/lib/rate-limit";
import { z } from "zod";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const shelf = await prisma.shelf.findFirst({
    where: { id, userId: session.user.id },
    include: {
      books: {
        orderBy: { position: "asc" },
        include: {
          book: {
            select: {
              id: true,
              title: true,
              author: true,
              coverUrl: true,
              originalFormat: true,
              readingProgress: {
                where: { userId: session.user.id },
                select: { percentage: true },
              },
            },
          },
        },
      },
    },
  });

  if (!shelf) {
    return NextResponse.json({ error: "Polc nem található" }, { status: 404 });
  }

  // Replace direct MinIO cover URLs with proxy URLs
  const shelfWithProxiedCovers = {
    ...shelf,
    books: shelf.books.map((sb) => ({
      ...sb,
      book: {
        ...sb.book,
        coverUrl: sb.book.coverUrl ? `/api/books/${sb.book.id}/cover` : null,
      },
    })),
  };

  return NextResponse.json(shelfWithProxiedCovers);
}

const updateShelfSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  isPublic: z.boolean().optional(),
});

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;

  const limited = checkRateLimit(request, "api", API_LIMIT);
  if (limited) return limited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const validated = updateShelfSchema.parse(body);

  const existing = await prisma.shelf.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Polc nem található" }, { status: 404 });
  }

  const shelf = await prisma.shelf.update({
    where: { id },
    data: validated,
  });

  return NextResponse.json(shelf);
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;

  const limited = checkRateLimit(request, "api", API_LIMIT);
  if (limited) return limited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.shelf.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Polc nem található" }, { status: 404 });
  }

  await prisma.shelf.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

const addBookSchema = z.object({
  bookId: z.string().min(1).max(50),
});

export async function POST(request: NextRequest, { params }: RouteParams) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;

  const limited = checkRateLimit(request, "api", API_LIMIT);
  if (limited) return limited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { bookId } = addBookSchema.parse(body);

  const shelf = await prisma.shelf.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!shelf) {
    return NextResponse.json({ error: "Polc nem található" }, { status: 404 });
  }

  const maxPos = await prisma.shelfBook.findFirst({
    where: { shelfId: id },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const shelfBook = await prisma.shelfBook.create({
    data: {
      shelfId: id,
      bookId,
      position: (maxPos?.position ?? -1) + 1,
    },
  });

  return NextResponse.json(shelfBook, { status: 201 });
}
