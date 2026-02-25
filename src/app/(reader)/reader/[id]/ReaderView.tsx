"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useOfflineBooks } from "@/hooks/useOfflineBooks";

const EpubReader = dynamic(() => import("@/components/reader/EpubReader"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-200 border-t-amber-700" />
    </div>
  ),
});

interface BookData {
  id: string;
  title: string;
  author: string;
  fileUrl: string;
  originalFormat: string;
  conversionStatus: string | null;
}

interface ProgressData {
  percentage: number;
  cfi: string | null;
}

interface ReaderViewProps {
  bookId: string;
}

export default function ReaderView({ bookId }: ReaderViewProps) {
  const t = useTranslations("reader");
  const tc = useTranslations("common");
  const [book, setBook] = useState<BookData | null>(null);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offlineBlobUrl, setOfflineBlobUrl] = useState<string | null>(null);
  const offlineBlobUrlRef = useRef<string | null>(null);
  const { getOfflineBookUrl, isBookOffline } = useOfflineBooks();
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Initialize from localStorage to match EpubReader's initial state and avoid flash
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("reader-settings");
        if (saved) {
          const settings = JSON.parse(saved);
          return settings.isDarkTheme === true;
        }
      } catch {}
    }
    return false;
  });

  const handleDarkModeChange = useCallback((isDark: boolean) => {
    setIsDarkMode(isDark);
  }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        const [bookRes, progressRes] = await Promise.all([
          fetch(`/api/books/${bookId}`),
          fetch(`/api/reading-progress/${bookId}`),
        ]);

        if (!bookRes.ok) throw new Error("Book not found");

        const bookData = await bookRes.json();
        const progressData = await progressRes.json();

        // Allow reading if EPUB or successfully converted
        const canRead =
          bookData.originalFormat === "epub" ||
          bookData.conversionStatus === "completed";

        if (!canRead) {
          if (bookData.conversionStatus === "pending" || bookData.conversionStatus === "converting") {
            setError(t("conversionInProgress"));
          } else if (bookData.conversionStatus === "failed") {
            setError(t("conversionFailed"));
          } else {
            setError(t("epubOnly"));
          }
          setLoading(false);
          return;
        }

        setBook(bookData);
        setProgress(progressData);
      } catch {
        // If offline, try loading from IndexedDB
        if (isBookOffline(bookId)) {
          try {
            const blobUrl = await getOfflineBookUrl(bookId);
            if (blobUrl) {
              setOfflineBlobUrl(blobUrl);
              offlineBlobUrlRef.current = blobUrl;
              setBook({ id: bookId, title: "", author: "", fileUrl: blobUrl, originalFormat: "epub", conversionStatus: null });
              setLoading(false);
              return;
            }
          } catch {}
        }
        setError(t("bookNotFound"));
      } finally {
        setLoading(false);
      }
    }
    fetchData();

    return () => {
      // Revoke blob URL on cleanup
      if (offlineBlobUrlRef.current) {
        URL.revokeObjectURL(offlineBlobUrlRef.current);
      }
    };
  }, [bookId]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-amber-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-amber-200 border-t-amber-700" />
          <p className="text-amber-700">{t("loadingBook")}</p>
        </div>
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-amber-50">
        <p className="text-lg text-red-600">{error || tc("unknownError")}</p>
        <Link href="/library" className="mt-4 text-amber-600 underline hover:text-amber-700">
          {t("backToLibrary")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Minimal header */}
      <div className={`flex items-center justify-between border-b px-4 py-2 transition-colors ${
        isDarkMode
          ? "border-amber-900/30 bg-[#211a12]"
          : "border-amber-200 bg-amber-50/90"
      }`}>
        <Link
          href={`/book/${bookId}`}
          className={`flex items-center gap-1 text-sm transition-colors ${
            isDarkMode
              ? "text-amber-400 hover:text-amber-300"
              : "text-amber-700 hover:text-amber-600"
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          {tc("back")}
        </Link>
        <div className="text-center">
          <p className={`text-sm font-semibold line-clamp-1 transition-colors ${
            isDarkMode ? "text-amber-200" : "text-amber-900"
          }`}>{book.title}</p>
          <p className={`text-xs transition-colors ${
            isDarkMode ? "text-amber-400" : "text-amber-700/60"
          }`}>{book.author}</p>
        </div>
        <div className="w-16" /> {/* Spacer for centering */}
      </div>

      {/* Reader - relative container so EpubReader can use absolute positioning */}
      <div className="relative flex-1">
        <EpubReader
          bookId={book.id}
          url={offlineBlobUrl || `/api/books/${book.id}/download`}
          initialCfi={progress?.cfi}
          onDarkModeChange={handleDarkModeChange}
        />
      </div>
    </div>
  );
}
