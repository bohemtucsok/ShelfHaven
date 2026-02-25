"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useParams } from "next/navigation";
import BookshelfRow from "@/components/bookshelf/BookshelfRow";
import { toast } from "sonner";

interface ShelfBookData {
  book: {
    id: string;
    title: string;
    author: string | null;
    coverUrl: string | null;
    blurHash: string | null;
    originalFormat: string;
    readingProgress: Array<{ percentage: number }>;
  };
}

interface ShelfData {
  id: string;
  name: string;
  description: string | null;
  books: ShelfBookData[];
}

export default function ShelfDetailPage() {
  const params = useParams<{ id: string }>();
  const shelfId = params.id;

  const [shelf, setShelf] = useState<ShelfData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [removingBookId, setRemovingBookId] = useState<string | null>(null);

  const fetchShelf = useCallback(async () => {
    try {
      const res = await fetch(`/api/shelves/${shelfId}`);
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      setShelf(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [shelfId]);

  useEffect(() => {
    fetchShelf();
  }, [fetchShelf]);

  async function handleRemoveBook(bookId: string) {
    setRemovingBookId(bookId);
    try {
      const res = await fetch(`/api/shelves/${shelfId}/books/${bookId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setShelf((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            books: prev.books.filter((sb) => sb.book.id !== bookId),
          };
        });
        toast.success("Könyv eltávolítva a polcról");
      } else {
        toast.error("Nem sikerült eltávolítani");
      }
    } catch {
      toast.error("Nem sikerült eltávolítani");
    } finally {
      setRemovingBookId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-amber-200 border-t-amber-700" />
      </div>
    );
  }

  if (error || !shelf) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <p className="text-lg text-amber-700/70 dark:text-[var(--text-muted)]">A polc nem található</p>
        <Link href="/shelves" className="mt-4 text-amber-600 underline hover:text-amber-700">
          Vissza a polcaimhoz
        </Link>
      </div>
    );
  }

  // Map shelf books to BookshelfRow format
  const bookItems = shelf.books.map((sb) => ({
    id: sb.book.id,
    title: sb.book.title,
    author: sb.book.author || "Ismeretlen szerző",
    coverUrl: sb.book.coverUrl,
    blurHash: sb.book.blurHash,
    format: sb.book.originalFormat,
    progress: sb.book.readingProgress?.[0]?.percentage,
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Back link */}
      <Link
        href="/shelves"
        className="mb-6 inline-flex items-center gap-1 text-sm text-amber-700 dark:text-[var(--accent-gold)] hover:text-amber-600"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
        </svg>
        Vissza a polcaimhoz
      </Link>

      {/* Shelf header */}
      <motion.div
        className="mb-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-3xl font-bold text-[var(--text-primary)]">{shelf.name}</h1>
        {shelf.description && (
          <p className="mt-2 text-[var(--text-secondary)]">{shelf.description}</p>
        )}
        <p className="mt-1 text-sm text-amber-700/70 dark:text-[var(--text-muted)]">{shelf.books.length} könyv</p>
      </motion.div>

      {/* Books on shelf */}
      {shelf.books.length === 0 ? (
        <motion.div
          className="flex min-h-[30vh] flex-col items-center justify-center rounded-xl border border-amber-800/20 bg-amber-50/80 dark:bg-[var(--bg-card)] dark:border-[var(--border)] p-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <span className="text-5xl">📚</span>
          <p className="mt-4 text-lg text-amber-700/70 dark:text-[var(--text-muted)]">Ez a polc még üres</p>
          <p className="mt-1 text-sm text-amber-700/50 dark:text-[var(--text-muted)]">
            Adj hozzá könyveket a könyvtáradból!
          </p>
          <Link
            href="/library"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-700 px-5 py-2.5 font-semibold text-white shadow transition-colors hover:bg-amber-600"
          >
            Könyvtár megnyitása
          </Link>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          {/* Bookshelf visual */}
          <BookshelfRow books={bookItems} label={shelf.name} />

          {/* Book list for management */}
          <div className="mt-8 space-y-2">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-amber-700/60 dark:text-[var(--text-muted)]">
              Könyvek kezelése
            </h2>
            {shelf.books.map((sb) => (
              <div
                key={sb.book.id}
                className="flex items-center justify-between rounded-lg border border-amber-800/10 bg-amber-50/50 dark:bg-[var(--bg-secondary)] dark:border-[var(--border)] px-4 py-3 transition-colors hover:bg-amber-50 dark:hover:bg-[var(--bg-card)]"
              >
                <Link href={`/book/${sb.book.id}`} className="flex-1">
                  <p className="font-medium text-[var(--text-primary)]">{sb.book.title}</p>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {sb.book.author || "Ismeretlen szerző"}
                  </p>
                </Link>
                <button
                  onClick={() => handleRemoveBook(sb.book.id)}
                  disabled={removingBookId === sb.book.id}
                  className="ml-3 rounded-lg border border-red-200 dark:border-red-800/30 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                >
                  {removingBookId === sb.book.id ? "Eltávolítás..." : "Eltávolítás"}
                </button>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
