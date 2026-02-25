import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit, API_LIMIT } from "@/lib/rate-limit";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/books/[id]/share
 * Creates a SharedLink for the book. Only the book owner can share.
 */
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

  // Verify the book exists and belongs to the current user
  const book = await prisma.book.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!book) {
    return NextResponse.json(
      { error: "Könyv nem található vagy nincs jogosultságod" },
      { status: 404 }
    );
  }

  // Check if a shared link already exists for this book by this user
  const existing = await prisma.sharedLink.findFirst({
    where: { bookId: id, userId: session.user.id },
  });

  if (existing) {
    return NextResponse.json({
      url: `/shared/${existing.token}`,
      token: existing.token,
    });
  }

  // Create a new shared link
  const sharedLink = await prisma.sharedLink.create({
    data: {
      bookId: id,
      userId: session.user.id,
    },
  });

  return NextResponse.json(
    {
      url: `/shared/${sharedLink.token}`,
      token: sharedLink.token,
    },
    { status: 201 }
  );
}

/**
 * DELETE /api/books/[id]/share
 * Deletes the SharedLink for the book. Only the book owner can delete.
 */
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

  // Find and delete the shared link owned by the current user
  const sharedLink = await prisma.sharedLink.findFirst({
    where: { bookId: id, userId: session.user.id },
  });

  if (!sharedLink) {
    return NextResponse.json(
      { error: "Megosztott link nem található" },
      { status: 404 }
    );
  }

  await prisma.sharedLink.delete({
    where: { id: sharedLink.id },
  });

  return NextResponse.json({ success: true });
}
