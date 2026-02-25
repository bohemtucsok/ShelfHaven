import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toPublicUrl } from "@/lib/storage/minio";
import BookDetail from "./BookDetail";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations("bookDetail");

  const book = await prisma.book.findUnique({
    where: { id },
    select: { title: true, author: true, description: true },
  });

  if (!book) {
    return { title: t("bookNotFound") };
  }

  const title = book.author ? `${book.title} - ${book.author}` : book.title;
  const description = book.description || book.title;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "book",
      images: [`/api/books/${id}/cover`],
    },
  };
}

export default async function BookPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();

  // Fetch full book data server-side for instant render
  const bookRaw = await prisma.book.findUnique({
    where: { id },
    include: {
      categories: {
        select: { category: { select: { id: true, name: true, slug: true } } },
      },
      topics: {
        select: { topic: { select: { id: true, name: true, color: true } } },
      },
      user: { select: { id: true, name: true } },
      reviews: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          userId: true,
          rating: true,
          text: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
        },
      },
      _count: { select: { likes: true } },
    },
  });

  if (!bookRaw) {
    return <BookDetail bookId={id} />;
  }

  // Increment view count (fire-and-forget)
  prisma.book
    .update({ where: { id }, data: { viewCount: { increment: 1 } } })
    .catch(() => {});

  const avgRating =
    bookRaw.reviews.length > 0
      ? Math.round(
          (bookRaw.reviews.reduce((sum, r) => sum + r.rating, 0) /
            bookRaw.reviews.length) *
            10
        ) / 10
      : 0;

  // Build serializable initial book object (no Date objects)
  const initialBook = {
    id: bookRaw.id,
    title: bookRaw.title,
    author: bookRaw.author || "",
    description: bookRaw.description,
    coverUrl: bookRaw.coverUrl ? `/api/books/${id}/cover` : null,
    blurHash: bookRaw.blurHash,
    fileUrl: toPublicUrl(bookRaw.fileUrl) || "",
    originalFormat: bookRaw.originalFormat,
    fileSize: bookRaw.fileSize,
    language: bookRaw.language,
    pageCount: bookRaw.pageCount,
    createdAt: bookRaw.createdAt.toISOString(),
    categories: bookRaw.categories,
    topics: bookRaw.topics,
    user: bookRaw.user,
    reviews: bookRaw.reviews.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
    avgRating,
    totalLikes: bookRaw._count.likes,
    downloadCount: bookRaw.downloadCount,
    viewCount: bookRaw.viewCount,
    conversionStatus: bookRaw.conversionStatus,
    conversionError: bookRaw.conversionError,
    originalFileUrl: bookRaw.originalFileUrl
      ? toPublicUrl(bookRaw.originalFileUrl)
      : null,
    isOwner: session?.user?.id ? bookRaw.userId === session.user.id : false,
    liked: false,
    saved: false,
    readingProgress: undefined as
      | {
          percentage: number;
          cfi: string | null;
          currentPage: number | null;
          totalPages: number | null;
          lastReadAt: string | null;
        }
      | undefined,
  };

  // Authenticated extras
  if (session?.user?.id) {
    const [userLike, progress, userSaved] = await Promise.all([
      prisma.like.findUnique({
        where: {
          userId_bookId: { userId: session.user.id, bookId: id },
        },
      }),
      prisma.readingProgress.findFirst({
        where: { userId: session.user.id, bookId: id },
      }),
      prisma.savedBook.findUnique({
        where: {
          userId_bookId: { userId: session.user.id, bookId: id },
        },
      }),
    ]);
    initialBook.liked = !!userLike;
    initialBook.saved = !!userSaved;
    if (progress) {
      initialBook.readingProgress = {
        percentage: progress.percentage,
        cfi: progress.cfi,
        currentPage: progress.currentPage,
        totalPages: progress.totalPages,
        lastReadAt: progress.lastReadAt?.toISOString() || null,
      };
    }
  }

  return <BookDetail bookId={id} initialBook={initialBook} />;
}
