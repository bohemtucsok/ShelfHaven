import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import LibraryView from "./LibraryView";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: t("libraryTitle"),
    description: t("libraryDescription"),
  };
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LibraryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const hasFilters = !!(params.q || params.category);

  // Only prefetch when logged in and no URL filters (the common case)
  const session = await auth();
  if (!session?.user?.id || hasFilters) {
    return <LibraryView />;
  }

  const [booksRaw, categories] = await Promise.all([
    prisma.book.findMany({
      where: {
        OR: [
          { userId: session.user.id },
          { savedBooks: { some: { userId: session.user.id } } },
        ],
      },
      select: {
        id: true,
        title: true,
        author: true,
        coverUrl: true,
        blurHash: true,
        originalFormat: true,
        userId: true,
        categories: {
          select: { category: { select: { id: true, name: true } } },
        },
        topics: {
          select: { topic: { select: { id: true, name: true, color: true } } },
        },
        readingProgress: {
          where: { userId: session.user.id },
          select: { percentage: true },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.category.findMany({
      orderBy: { order: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        icon: true,
        _count: { select: { books: true } },
      },
    }),
  ]);

  const initialBooks = booksRaw.map((b) => ({
    ...b,
    author: b.author || "",
    coverUrl: b.coverUrl ? `/api/books/${b.id}/cover` : null,
    isOwned: b.userId === session.user.id,
    isSaved: b.userId !== session.user.id,
  }));

  const authorSet = new Set<string>();
  booksRaw.forEach((b) => {
    if (b.author) authorSet.add(b.author);
  });

  return (
    <LibraryView
      initialBooks={initialBooks}
      initialCategories={categories}
      initialAuthors={Array.from(authorSet).sort()}
    />
  );
}
