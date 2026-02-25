import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit, API_LIMIT } from "@/lib/rate-limit";

type RouteParams = { params: Promise<{ id: string; bookId: string }> };

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;

  const limited = checkRateLimit(request, "api", API_LIMIT);
  if (limited) return limited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, bookId } = await params;

  const shelf = await prisma.shelf.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!shelf) {
    return NextResponse.json({ error: "Polc nem található" }, { status: 404 });
  }

  await prisma.shelfBook.delete({
    where: { shelfId_bookId: { shelfId: id, bookId } },
  });

  return NextResponse.json({ success: true });
}
