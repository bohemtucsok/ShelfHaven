import { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

type PageProps = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const t = await getTranslations("shared");

  const sharedLink = await prisma.sharedLink.findUnique({
    where: { token },
    include: {
      book: { select: { title: true, author: true, description: true, id: true } },
    },
  });

  if (!sharedLink || (sharedLink.expiresAt && sharedLink.expiresAt < new Date())) {
    return { title: t("notFound") };
  }

  const { book } = sharedLink;
  const title = book.author
    ? `${book.title} - ${book.author}`
    : book.title;

  return {
    title,
    description: book.description || book.title,
    openGraph: {
      title,
      description: book.description || book.title,
      type: "book",
      images: [`/api/books/${book.id}/cover`],
    },
  };
}

export default async function SharedBookPage({ params }: PageProps) {
  const { token } = await params;
  const t = await getTranslations("shared");
  const session = await auth();

  const sharedLink = await prisma.sharedLink.findUnique({
    where: { token },
    include: {
      book: {
        include: {
          categories: { include: { category: true } },
          topics: { include: { topic: true } },
          reviews: { select: { rating: true } },
          user: { select: { name: true } },
        },
      },
    },
  });

  if (!sharedLink || (sharedLink.expiresAt && sharedLink.expiresAt < new Date())) {
    notFound();
  }

  // Increment view count (fire-and-forget)
  prisma.sharedLink
    .update({
      where: { id: sharedLink.id },
      data: { viewCount: { increment: 1 } },
    })
    .catch(() => {});

  const { book } = sharedLink;

  const avgRating =
    book.reviews.length > 0
      ? Math.round(
          (book.reviews.reduce((sum, r) => sum + r.rating, 0) /
            book.reviews.length) *
            10
        ) / 10
      : 0;

  const coverUrl = book.coverUrl ? `/api/books/${book.id}/cover` : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Book card */}
      <div className="overflow-hidden rounded-xl border border-amber-800/20 bg-[var(--bg-card)] shadow-lg">
        <div className="flex flex-col gap-6 p-6 sm:flex-row">
          {/* Cover image */}
          <div className="flex shrink-0 justify-center sm:justify-start">
            <div className="relative h-64 w-44 overflow-hidden rounded-lg border border-amber-800/20 bg-gradient-to-br from-amber-800 to-amber-950 shadow-md">
              {coverUrl ? (
                <Image
                  src={coverUrl}
                  alt={book.title}
                  fill
                  className="object-cover"
                  sizes="176px"
                  priority
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                  <svg
                    className="mb-2 h-12 w-12 text-amber-200/60"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                    />
                  </svg>
                  <span className="text-sm font-medium text-amber-200/80">
                    {book.title}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Book info */}
          <div className="flex flex-1 flex-col">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              {book.title}
            </h1>

            {book.author && (
              <p className="mt-1 text-lg text-[var(--text-secondary)]">
                {book.author}
              </p>
            )}

            {/* Uploader */}
            {book.user.name && (
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                {t("sharedBy")} {book.user.name}
              </p>
            )}

            {/* Average rating */}
            {avgRating > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <svg
                      key={star}
                      className={`h-5 w-5 ${
                        star <= Math.round(avgRating)
                          ? "text-amber-500"
                          : "text-amber-200 dark:text-amber-800"
                      }`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <span className="text-sm text-[var(--text-muted)]">
                  {avgRating} ({book.reviews.length} {t("ratings")})
                </span>
              </div>
            )}

            {/* Description */}
            {book.description && (
              <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-[var(--text-secondary)]">
                {book.description}
              </p>
            )}

            {/* Categories */}
            {book.categories.length > 0 && (
              <div className="mt-4">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  {t("categories")}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {book.categories.map((bc) => (
                    <span
                      key={bc.category.id}
                      className="inline-flex items-center rounded-full border border-amber-800/20 bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/30 dark:text-amber-200"
                    >
                      {bc.category.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Topics */}
            {book.topics.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  {t("topics")}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {book.topics.map((bt) => (
                    <span
                      key={bt.topic.id}
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                      style={{
                        backgroundColor: bt.topic.color || "#6b7280",
                      }}
                    >
                      {bt.topic.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CTA section */}
      <div className="mt-6 rounded-xl border border-amber-800/20 bg-[var(--bg-card)] p-6 text-center shadow-lg">
        {session?.user ? (
          <>
            <p className="mb-4 text-[var(--text-secondary)]">
              {t("loggedInCta")}
            </p>
            <Link
              href="/library"
              className="inline-flex items-center gap-2 rounded-lg bg-amber-700 px-6 py-2.5 font-medium text-white shadow-md transition-colors hover:bg-amber-800"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
              {t("goToLibrary")}
            </Link>
          </>
        ) : (
          <>
            <p className="mb-4 text-[var(--text-secondary)]">
              {t("guestCta")}
            </p>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-amber-700 px-6 py-2.5 font-medium text-white shadow-md transition-colors hover:bg-amber-800"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                />
              </svg>
              {t("registerToRead")}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
