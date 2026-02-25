import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit, API_LIMIT } from "@/lib/rate-limit";
import { slugify } from "@/lib/utils";
import { z } from "zod";

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional();

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  color: hexColor,
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;

  const limited = checkRateLimit(request, "api", API_LIMIT);
  if (limited) return limited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.topic.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  // Only creator or admin can edit
  if (existing.createdById !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const validated = updateSchema.parse(body);

  const data: Record<string, unknown> = { ...validated };
  if (validated.name) {
    const newSlug = slugify(validated.name);
    // Check slug uniqueness
    const slugExists = await prisma.topic.findFirst({
      where: { slug: newSlug, id: { not: id } },
    });
    if (slugExists) {
      return NextResponse.json({ error: "A téma neve már foglalt" }, { status: 409 });
    }
    data.slug = newSlug;
  }

  const topic = await prisma.topic.update({
    where: { id },
    data,
  });

  return NextResponse.json(topic);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrf = validateCsrf(request);
  if (csrf) return csrf;

  const limited = checkRateLimit(request, "api", API_LIMIT);
  if (limited) return limited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
  }

  const { id } = await params;

  const existing = await prisma.topic.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  await prisma.topic.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
