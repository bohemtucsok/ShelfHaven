import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit, API_LIMIT, PUBLIC_LIMIT } from "@/lib/rate-limit";
import { slugify } from "@/lib/utils";
import { z } from "zod";

export async function GET(request: NextRequest) {
  const limited = checkRateLimit(request, "public", PUBLIC_LIMIT);
  if (limited) return limited;

  const session = await auth();

  const topics = await prisma.topic.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      color: true,
      createdById: true,
      _count: {
        select: {
          books: session?.user?.id
            ? { where: { book: { userId: session.user.id } } }
            : true,
        },
      },
    },
  });

  return NextResponse.json(topics);
}

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional();

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: hexColor,
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

  const slug = slugify(validated.name);
  const existingSlug = await prisma.topic.findUnique({ where: { slug } });
  if (existingSlug) {
    return NextResponse.json({ error: "Topic already exists" }, { status: 409 });
  }

  const topic = await prisma.topic.create({
    data: {
      ...validated,
      slug,
      createdById: session.user.id,
    },
  });

  return NextResponse.json(topic, { status: 201 });
}
