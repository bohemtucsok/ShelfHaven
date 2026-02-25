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

  const highlights = await prisma.highlight.findMany({
    where: { bookId, userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(highlights);
}

const createSchema = z.object({
  cfiRange: z.string().max(2000),
  text: z.string().max(5000),
  color: z.enum(["yellow", "green", "blue", "pink"]).default("yellow"),
  note: z.string().max(2000).optional(),
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

  const highlight = await prisma.highlight.create({
    data: {
      userId: session.user.id,
      bookId,
      ...validated,
    },
  });

  return NextResponse.json(highlight, { status: 201 });
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
    return NextResponse.json(
      { error: "Highlight ID is required" },
      { status: 400 }
    );
  }

  const highlight = await prisma.highlight.findFirst({
    where: { id, bookId, userId: session.user.id },
  });

  if (!highlight) {
    return NextResponse.json(
      { error: "Highlight not found" },
      { status: 404 }
    );
  }

  await prisma.highlight.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
