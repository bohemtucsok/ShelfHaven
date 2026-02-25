import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateCsrf } from "@/lib/csrf";
import { checkRateLimit, API_LIMIT } from "@/lib/rate-limit";
import { z } from "zod";

const bookSchema = z.object({
  title: z.string().min(1).max(500),
  author: z.string().max(200).nullable().optional(),
  description: z.string().max(10000).nullable().optional(),
  language: z.string().max(10).nullable().optional(),
  isbn: z.string().max(20).nullable().optional(),
  publishedYear: z.number().int().min(0).max(2100).nullable().optional(),
  categories: z.array(z.string().max(100)).max(20).optional(),
  topics: z.array(z.string().max(100)).max(20).optional(),
});

const importSchema = z.object({
  version: z.number(),
  books: z.array(bookSchema).max(500),
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

  try {
    const body = await request.json();
    const validated = importSchema.parse(body);

    let imported = 0;
    let skipped = 0;

    for (const bookData of validated.books) {
      // Check for duplicate (title + author)
      const existing = await prisma.book.findFirst({
        where: {
          userId: session.user.id,
          title: bookData.title,
          ...(bookData.author ? { author: bookData.author } : {}),
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      // Create book record (metadata only, no file)
      const book = await prisma.book.create({
        data: {
          title: bookData.title,
          author: bookData.author || null,
          description: bookData.description || null,
          language: bookData.language || "hu",
          isbn: bookData.isbn || null,
          publishedYear: bookData.publishedYear || null,
          originalFormat: "imported",
          fileUrl: "",
          fileSize: 0,
          userId: session.user.id,
        },
      });

      // Link categories (if exist)
      if (bookData.categories?.length) {
        const cats = await prisma.category.findMany({
          where: { name: { in: bookData.categories } },
        });
        if (cats.length > 0) {
          await prisma.bookCategory.createMany({
            data: cats.map((c) => ({ bookId: book.id, categoryId: c.id })),
            skipDuplicates: true,
          });
        }
      }

      // Link topics (if exist)
      if (bookData.topics?.length) {
        const topics = await prisma.topic.findMany({
          where: { name: { in: bookData.topics } },
        });
        if (topics.length > 0) {
          await prisma.bookTopic.createMany({
            data: topics.map((t) => ({ bookId: book.id, topicId: t.id })),
            skipDuplicates: true,
          });
        }
      }

      imported++;
    }

    return NextResponse.json({ imported, skipped });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid import format" }, { status: 400 });
    }
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
