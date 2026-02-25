import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const books = await prisma.book.findMany({
    where: { userId: session.user.id },
    select: {
      title: true,
      author: true,
      description: true,
      originalFormat: true,
      language: true,
      isbn: true,
      publishedYear: true,
      categories: { select: { category: { select: { name: true, slug: true } } } },
      topics: { select: { topic: { select: { name: true } } } },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    user: session.user.name || session.user.email,
    bookCount: books.length,
    books: books.map((b) => ({
      title: b.title,
      author: b.author,
      description: b.description,
      format: b.originalFormat,
      language: b.language,
      isbn: b.isbn,
      publishedYear: b.publishedYear,
      categories: b.categories.map((c) => c.category.name),
      topics: b.topics.map((t) => t.topic.name),
      addedAt: b.createdAt,
    })),
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="shelfhaven-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
