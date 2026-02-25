"use client";

import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import SaveToLibraryButton from "@/components/bookshelf/SaveToLibraryButton";

interface DiscoverBook {
  id: string;
  title: string;
  author?: string | null;
  coverUrl: string | null;
  userId?: string;
}

interface DiscoverSectionProps {
  title: string;
  description?: string;
  books: DiscoverBook[];
  renderExtra?: (book: DiscoverBook, index: number) => React.ReactNode;
}

export default function DiscoverSection({ title, description, books, renderExtra }: DiscoverSectionProps) {
  const { data: session } = useSession();
  if (books.length === 0) return null;

  return (
    <div>
      <h2 className="text-lg font-bold text-[var(--text-primary)]">{title}</h2>
      {description && (
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">{description}</p>
      )}
      <div className="mt-3 flex gap-4 overflow-x-auto pb-2">
        {books.map((book, i) => (
          <Link
            key={book.id}
            href={`/book/${book.id}`}
            className="group flex w-28 shrink-0 flex-col"
          >
            <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gradient-to-br from-amber-800 to-amber-950 shadow-md transition-transform group-hover:scale-105">
              {book.coverUrl ? (
                <Image
                  src={book.coverUrl}
                  alt={book.title}
                  fill
                  className="object-cover"
                  sizes="112px"
                />
              ) : (
                <div className="flex h-full items-center justify-center p-2 text-center">
                  <span className="text-xs font-medium text-amber-100">{book.title}</span>
                </div>
              )}
              {session?.user?.id && book.userId && book.userId !== session.user.id && (
                <div className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <SaveToLibraryButton
                    bookId={book.id}
                    isOwned={false}
                    variant="icon"
                  />
                </div>
              )}
              {renderExtra && (
                <div className="absolute bottom-0 left-0 right-0">
                  {renderExtra(book, i)}
                </div>
              )}
            </div>
            <p className="mt-1.5 line-clamp-2 text-xs font-medium text-[var(--text-primary)]">
              {book.title}
            </p>
            {book.author && (
              <p className="line-clamp-1 text-[10px] text-[var(--text-muted)]">
                {book.author}
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
