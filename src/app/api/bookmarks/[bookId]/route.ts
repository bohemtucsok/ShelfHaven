import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit, API_LIMIT } from "@/lib/rate-limit";
import { z } from "zod";

type RouteParams = { params: Promise<{ bookId: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bookId } = await params;

  const bookmarks = await prisma.bookmark.findMany({
    where: { bookId, userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(bookmarks);
}

const createSchema = z.object({
  cfi: z.string().max(2000),
  label: z.string().max(200).optional(),
  note: z.string().max(2000).optional(),
  percentage: z.number().min(0).max(100),
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

  const { bookId } = await params;
  const body = await request.json();
  const validated = createSchema.parse(body);

  const bookmark = await prisma.bookmark.create({
    data: {
      userId: session.user.id,
      bookId,
      ...validated,
    },
  });

  return NextResponse.json(bookmark, { status: 201 });
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

  const { bookId } = await params;
  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Bookmark ID is required" }, { status: 400 });
  }

  const bookmark = await prisma.bookmark.findFirst({
    where: { id, bookId, userId: session.user.id },
  });

  if (!bookmark) {
    return NextResponse.json({ error: "Bookmark not found" }, { status: 404 });
  }

  await prisma.bookmark.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
