"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import SaveToLibraryButton from "@/components/bookshelf/SaveToLibraryButton";

interface TrendingBook {
  id: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  userId?: string;
  likes: number;
}

export default function TrendingCard({ book, rank }: { book: TrendingBook; rank: number }) {
  const t = useTranslations("discover");
  const { data: session } = useSession();

  return (
    <Link
      href={`/book/${book.id}`}
      className="group flex w-32 shrink-0 flex-col"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gradient-to-br from-amber-800 to-amber-950 shadow-md transition-transform group-hover:scale-105">
        {book.coverUrl ? (
          <Image
            src={book.coverUrl}
            alt={book.title}
            fill
            className="object-cover"
            sizes="128px"
          />
        ) : (
          <div className="flex h-full items-center justify-center p-2 text-center">
            <span className="text-xs font-medium text-amber-100">{book.title}</span>
          </div>
        )}
        {/* Rank badge */}
        <div className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-amber-700/90 text-xs font-bold text-white shadow">
          #{rank}
        </div>
        {/* Likes badge */}
        <div className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
          <svg className="h-3 w-3 text-red-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
          </svg>
          {book.likes}
        </div>
        {/* Save button */}
        {session?.user?.id && book.userId && book.userId !== session.user.id && (
          <div className="absolute right-1 top-8 opacity-0 transition-opacity group-hover:opacity-100">
            <SaveToLibraryButton
              bookId={book.id}
              isOwned={false}
              variant="icon"
            />
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
  );
}
