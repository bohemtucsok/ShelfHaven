"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import ShelfScene from "@/components/bookshelf/ShelfScene";
import BookCover from "@/components/bookshelf/BookCover";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { useFilterStore } from "@/store/filter-store";
import { useOfflineBooks } from "@/hooks/useOfflineBooks";

interface Book {
  id: string;
  title: string;
  author: string;
  coverUrl: string | null;
  blurHash: string | null;
  originalFormat: string;
  categories: { category: { id: string; name: string } }[];
  topics: { topic: { id: string; name: string; color: string | null } }[];
  readingProgress?: Array<{ percentage: number }>;
  isOwned?: boolean;
  isSaved?: boolean;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  _count: { books: number };
}

type ViewMode = "shelf" | "grid";
type SortMode = "newest" | "popular" | "most-liked" | "title";

interface LibraryViewProps {
  initialBooks?: Book[];
  initialCategories?: Category[];
  initialAuthors?: string[];
}

export default function LibraryView({ initialBooks, initialCategories, initialAuthors }: LibraryViewProps = {}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations("library");
  const tc = useTranslations("common");
  const urlQuery = searchParams.get("q") || "";
  const urlCategory = searchParams.get("category") || "";

  const { data: session } = useSession();
  const { isBookOffline } = useOfflineBooks();
  const [books, setBooks] = useState<Book[]>(initialBooks || []);
  const [categories, setCategories] = useState<Category[]>(initialCategories || []);
  const [authors, setAuthors] = useState<string[]>(initialAuthors || []);
  const [loading, setLoading] = useState(!initialBooks);
  const skipInitialFetch = useRef(!!initialBooks);
  const [viewMode, setViewMode] = useState<ViewMode>("shelf");
  const viewSynced = useRef(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedAuthor, setSelectedAuthor] = useState<string>("");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [searchQuery, setSearchQuery] = useState(urlQuery);
  const [showFilters, setShowFilters] = useState(false);
  const { format, dateRange, minRating, status, setFormat, setDateRange, setMinRating, setStatus, clearFilters, activeCount } = useFilterStore();

  // Sync default view from session (loads async)
  useEffect(() => {
    if (!viewSynced.current && session?.user?.defaultView) {
      setViewMode(session.user.defaultView as ViewMode);
      viewSynced.current = true;
    }
  }, [session]);

  // Switch view and persist preference
  const switchView = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    fetch("/api/user/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultView: mode }),
    }).catch(() => {});
  }, []);

  // Sync local search with URL param
  useEffect(() => {
    setSearchQuery(urlQuery);
  }, [urlQuery]);

  const handleSearch = useCallback(() => {
    const trimmed = searchQuery.trim();
    if (trimmed) {
      router.push(`/library?q=${encodeURIComponent(trimmed)}`);
    } else {
      router.push("/library");
    }
  }, [searchQuery, router]);

  // Fetch categories once (skip if server-side data provided)
  useEffect(() => {
    if (initialCategories) return;
    fetch("/api/categories")
      .then((res) => res.json())
      .then((data) => setCategories(data || []))
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch books when filters change
  useEffect(() => {
    // Skip initial fetch if server-side data provided
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
    async function fetchBooks() {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (urlQuery) params.set("q", urlQuery);
        if (urlCategory) params.set("category", urlCategory);
        if (selectedAuthor) params.set("author", selectedAuthor);
        if (sortMode !== "newest") params.set("sort", sortMode);
        if (format) params.set("format", format);
        if (dateRange) params.set("dateRange", dateRange);
        if (minRating) params.set("minRating", minRating);
        if (status) params.set("status", status);

        const booksUrl = `/api/books${params.toString() ? `?${params}` : ""}`;
        const booksRes = await fetch(booksUrl);
        const booksData = await booksRes.json();
        setBooks(booksData.books || []);
        setAuthors(booksData.authors || []);

        // Auto-select category tab if URL has category slug
        if (urlCategory && categories.length > 0) {
          const matchingCat = categories.find((c) => c.slug === urlCategory);
          if (matchingCat) {
            setSelectedCategory(matchingCat.id);
          }
        }
      } catch {
        console.error("Failed to fetch library data");
      } finally {
        setLoading(false);
      }
    }
    fetchBooks();
  }, [urlQuery, urlCategory, selectedAuthor, sortMode, format, dateRange, minRating, status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute user-specific category counts from own books
  const userCategories = useMemo(() => {
    const countMap = new Map<string, number>();
    for (const book of books) {
      for (const { category } of book.categories) {
        countMap.set(category.id, (countMap.get(category.id) || 0) + 1);
      }
    }
    return categories
      .filter((cat) => countMap.has(cat.id))
      .map((cat) => ({ ...cat, _count: { books: countMap.get(cat.id) || 0 } }));
  }, [books, categories]);

  const filteredBooks = useMemo(() => {
    if (selectedCategory) {
      return books.filter((b) =>
        b.categories.some((c) => c.category.id === selectedCategory)
      );
    }
    return books;
  }, [books, selectedCategory]);

  // Deterministic shuffle seed based on book IDs (stable across SSR/CSR)
  const shuffleSeed = useMemo(() => {
    let hash = 0;
    const ids = filteredBooks.map((b) => b.id).join(",");
    for (let i = 0; i < ids.length; i++) {
      hash = ((hash << 5) - hash + ids.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }, [filteredBooks]);

  // Build shelves: max 2 rows, shuffled, mixed categories
  const shelves = useMemo(() => {
    const mapped = filteredBooks.map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      coverUrl: b.coverUrl,
      blurHash: b.blurHash,
      format: b.originalFormat,
      progress: b.readingProgress?.[0]?.percentage,
    }));

    // Seeded Fisher-Yates shuffle (deterministic for same book list)
    const shuffled = [...mapped];
    let seed = shuffleSeed;
    const seededRandom = () => {
      seed = (seed * 16807 + 0) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(seededRandom() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    if (shuffled.length === 0) return [];

    // Split into max 2 shelves
    const booksPerShelf = Math.ceil(shuffled.length / 2);
    const row1 = shuffled.slice(0, booksPerShelf);
    const row2 = shuffled.slice(booksPerShelf);

    const label = selectedCategory
      ? categories.find((c) => c.id === selectedCategory)?.name || tc("books")
      : t("title");

    const result = [{ label, books: row1 }];
    if (row2.length > 0) {
      result.push({ label: "", books: row2 });
    }
    return result;
  }, [filteredBooks, selectedCategory, categories, t, tc, shuffleSeed]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-amber-200 border-t-amber-700" />
          <p className="text-amber-700/70">{t("loadingLibrary")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">{t("title")}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {books.length} {tc("books")}
          </p>
        </div>

        <Link
          href="/upload"
          className="inline-flex items-center gap-2 rounded-lg bg-amber-700 px-5 py-2.5 font-semibold text-white shadow-md transition-colors hover:bg-amber-600"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          {t("uploadBook")}
        </Link>
      </div>

      {/* Filters bar */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-600/50"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            placeholder={t("searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
            className="w-full rounded-lg border border-amber-800/20 bg-white py-2.5 pl-10 pr-4 text-sm dark:bg-[var(--bg-input)] dark:border-[var(--border)] text-[var(--text-primary)] outline-none transition-colors focus:border-amber-600 focus:ring-1 focus:ring-amber-600/50"
          />
        </div>

        {/* Author filter */}
        {authors.length > 1 && (
          <select
            value={selectedAuthor}
            onChange={(e) => setSelectedAuthor(e.target.value)}
            className="rounded-lg border border-amber-800/20 bg-white px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-amber-600 dark:bg-[var(--bg-input)] dark:border-[var(--border)]"
          >
            <option value="">{t("allAuthors")}</option>
            {authors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}

        {/* Sort */}
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          className="rounded-lg border border-amber-800/20 bg-white px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-amber-600 dark:bg-[var(--bg-input)] dark:border-[var(--border)]"
        >
          <option value="newest">{t("newest")}</option>
          <option value="title">{t("titleAZ")}</option>
          <option value="popular">{t("mostPopular")}</option>
          <option value="most-liked">{t("mostLiked")}</option>
        </select>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`relative rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
            activeCount() > 0
              ? "border-amber-600 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:border-[var(--accent-gold)] dark:text-[var(--accent-gold)]"
              : "border-amber-800/20 bg-white text-[var(--text-secondary)] hover:bg-amber-50 dark:bg-[var(--bg-input)] dark:border-[var(--border)] dark:hover:bg-amber-900/30"
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="inline h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
          </svg>
          {t("filters")}
          {activeCount() > 0 && (
            <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-700 text-[10px] font-bold text-white">
              {activeCount()}
            </span>
          )}
        </button>

        {/* View toggle */}
        <div className="flex rounded-lg border border-amber-800/20 bg-white p-0.5 dark:bg-[var(--bg-input)] dark:border-[var(--border)]">
          <button
            onClick={() => switchView("shelf")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === "shelf"
                ? "bg-amber-700 text-white"
                : "text-amber-700 hover:bg-amber-100 dark:text-[var(--text-muted)] dark:hover:bg-amber-900/30"
            }`}
          >
            {t("shelfView")}
          </button>
          <button
            onClick={() => switchView("grid")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === "grid"
                ? "bg-amber-700 text-white"
                : "text-amber-700 hover:bg-amber-100 dark:text-[var(--text-muted)] dark:hover:bg-amber-900/30"
            }`}
          >
            {t("gridView")}
          </button>
        </div>
      </div>

      {/* Advanced filters panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mb-4 overflow-hidden"
          >
            <div className="rounded-xl border border-amber-800/20 bg-amber-50/80 p-4 dark:bg-[var(--bg-card)] dark:border-[var(--border)]">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {/* Format */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">{t("filterFormat")}</label>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    className="w-full rounded-lg border border-amber-800/20 bg-white px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-amber-600 dark:bg-[var(--bg-input)] dark:border-[var(--border)]"
                  >
                    <option value="">{tc("all")}</option>
                    <option value="epub">EPUB</option>
                    <option value="pdf">PDF</option>
                    <option value="mobi">MOBI</option>
                  </select>
                </div>
                {/* Date range */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">{t("filterDate")}</label>
                  <select
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value)}
                    className="w-full rounded-lg border border-amber-800/20 bg-white px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-amber-600 dark:bg-[var(--bg-input)] dark:border-[var(--border)]"
                  >
                    <option value="">{tc("all")}</option>
                    <option value="week">{t("lastWeek")}</option>
                    <option value="month">{t("lastMonth")}</option>
                    <option value="year">{t("lastYear")}</option>
                  </select>
                </div>
                {/* Min rating */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">{t("filterRating")}</label>
                  <select
                    value={minRating}
                    onChange={(e) => setMinRating(e.target.value)}
                    className="w-full rounded-lg border border-amber-800/20 bg-white px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-amber-600 dark:bg-[var(--bg-input)] dark:border-[var(--border)]"
                  >
                    <option value="">{tc("all")}</option>
                    <option value="3">★★★+</option>
                    <option value="4">★★★★+</option>
                    <option value="5">★★★★★</option>
                  </select>
                </div>
                {/* Reading status */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">{t("filterStatus")}</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full rounded-lg border border-amber-800/20 bg-white px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-amber-600 dark:bg-[var(--bg-input)] dark:border-[var(--border)]"
                  >
                    <option value="">{tc("all")}</option>
                    <option value="unread">{t("statusUnread")}</option>
                    <option value="reading">{t("statusReading")}</option>
                    <option value="finished">{t("statusFinished")}</option>
                    <option value="saved">{t("statusSaved")}</option>
                  </select>
                </div>
              </div>
              {activeCount() > 0 && (
                <button
                  onClick={clearFilters}
                  className="mt-3 text-xs font-medium text-amber-700 hover:text-amber-600 hover:underline dark:text-[var(--accent-gold)]"
                >
                  {t("clearFilters")}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active search indicator */}
      {urlQuery && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-sm text-amber-700/70">{t("searchLabel")}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-200/60 px-3 py-1 text-sm font-medium text-amber-900 dark:bg-amber-800/40 dark:text-[var(--text-primary)]">
            &ldquo;{urlQuery}&rdquo;
            <button
              onClick={() => router.push("/library")}
              className="ml-1 rounded-full p-0.5 transition-colors hover:bg-amber-300/60"
              title={t("clearSearch")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </span>
        </div>
      )}

      {/* Category tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            !selectedCategory
              ? "bg-amber-700 text-white"
              : "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-[var(--text-secondary)] dark:hover:bg-amber-800/40"
          }`}
        >
          {t("allCategories")}
        </button>
        <Link
          href="/shelves"
          className="rounded-full bg-amber-100 px-4 py-1.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-200"
        >
          {t("myShelves")}
        </Link>
        {userCategories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              selectedCategory === cat.id
                ? "bg-amber-700 text-white"
                : "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-[var(--text-secondary)] dark:hover:bg-amber-800/40"
            }`}
          >
            {cat.icon && <span className="mr-1">{cat.icon}</span>}
            {cat.name}
            <span className="ml-1.5 text-xs opacity-60">({cat._count.books})</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {viewMode === "shelf" ? (
          <motion.div
            key="shelf"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <ShelfScene shelves={shelves} />
          </motion.div>
        ) : (
          <motion.div
            key="grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
          >
            {filteredBooks.map((book) => (
              <BookCover
                key={book.id}
                id={book.id}
                title={book.title}
                author={book.author}
                coverUrl={book.coverUrl}
                blurHash={book.blurHash}
                format={book.originalFormat}
                progress={book.readingProgress?.[0]?.percentage}
                isOffline={isBookOffline(book.id)}
                isSaved={book.isSaved}
              />
            ))}
            {filteredBooks.length === 0 && (
              <div className="col-span-full py-20 text-center">
                <p className="text-lg text-amber-700/60">{tc("noResults")}</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
