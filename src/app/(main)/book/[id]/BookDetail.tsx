"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { matchCategoriesAndTopics } from "@/lib/ebook/category-matcher";
import { blurHashToDataURL } from "@/lib/blurhash-to-url";
import RecommendationSection from "@/components/bookshelf/RecommendationSection";
import SaveToLibraryButton from "@/components/bookshelf/SaveToLibraryButton";
import CommentSection from "@/components/social/CommentSection";
import { useOfflineBooks } from "@/hooks/useOfflineBooks";

interface Book {
  id: string;
  title: string;
  author: string;
  description: string | null;
  coverUrl: string | null;
  blurHash: string | null;
  fileUrl: string;
  originalFormat: string;
  fileSize: number;
  language: string | null;
  pageCount: number | null;
  createdAt: string;
  categories: { category: { id: string; name: string; slug: string } }[];
  topics: { topic: { id: string; name: string; color: string | null } }[];
  user: { id: string; name: string | null };
  reviews: Review[];
  avgRating: number;
  totalLikes: number;
  downloadCount: number;
  viewCount: number;
  conversionStatus: string | null;
  conversionError: string | null;
  originalFileUrl: string | null;
  isOwner: boolean;
  liked: boolean;
  saved: boolean;
  readingProgress?: ReadingProgress;
}

interface Review {
  id: string;
  userId: string;
  rating: number;
  text: string | null;
  createdAt: string;
  user: { id: string; name: string | null };
}

interface ReadingProgress {
  percentage: number;
  cfi: string | null;
  currentPage: number | null;
  totalPages: number | null;
  lastReadAt: string | null;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
}

interface Topic {
  id: string;
  name: string;
  color: string | null;
}

interface MetadataResult {
  title: string;
  author: string | null;
  description: string | null;
  publishedYear: number | null;
  coverUrl: string | null;
  isbn: string | null;
  rating: number | null;
  categories: string[];
  source: "hardcover" | "google";
  sourceUrl?: string;
}

interface BookDetailProps {
  bookId: string;
  initialBook?: Book;
}

function StarRating({
  rating,
  onRate,
  size = "md",
}: {
  rating: number;
  onRate?: (r: number) => void;
  size?: "sm" | "md";
}) {
  const [hovered, setHovered] = useState(0);
  const sizeClass = size === "sm" ? "h-4 w-4" : "h-6 w-6";

  return (
    <div className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = hovered ? star <= hovered : star <= Math.round(rating);
        return (
          <button
            key={star}
            type="button"
            disabled={!onRate}
            onClick={() => onRate?.(star)}
            onMouseEnter={() => onRate && setHovered(star)}
            onMouseLeave={() => onRate && setHovered(0)}
            className={`${onRate ? "cursor-pointer" : "cursor-default"} transition-colors`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`${sizeClass} ${filled ? "text-amber-500" : "text-amber-300/50"}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

export default function BookDetail({ bookId, initialBook }: BookDetailProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const t = useTranslations("bookDetail");
  const tc = useTranslations("common");
  const [book, setBook] = useState<Book | null>(initialBook || null);
  const [loading, setLoading] = useState(!initialBook);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editAuthor, setEditAuthor] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [allTopics, setAllTopics] = useState<Topic[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [shelves, setShelves] = useState<Array<{ id: string; name: string }>>([]);
  const [showShelfPicker, setShowShelfPicker] = useState(false);
  const [addingToShelf, setAddingToShelf] = useState<string | null>(null);
  const [reconverting, setReconverting] = useState(false);

  // Metadata search state
  const [showMetadataSearch, setShowMetadataSearch] = useState(false);
  const [metadataResults, setMetadataResults] = useState<MetadataResult[]>([]);
  const [searchingMetadata, setSearchingMetadata] = useState(false);
  const [loadingCover, setLoadingCover] = useState<number | null>(null);

  // Review state
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);

  // Description expand state
  const [descExpanded, setDescExpanded] = useState(false);

  // Share state
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharingInProgress, setSharingInProgress] = useState(false);

  // Offline state
  const { saveBookOffline, removeOfflineBook, isBookOffline } = useOfflineBooks();
  const [offlineDownloading, setOfflineDownloading] = useState(false);
  const isOffline = isBookOffline(bookId);

  // Blurhash placeholder
  const blurDataURL = useMemo(
    () => (book?.blurHash ? blurHashToDataURL(book.blurHash) : undefined),
    [book?.blurHash]
  );

  // Like state
  const [liked, setLiked] = useState(initialBook?.liked || false);
  const [totalLikes, setTotalLikes] = useState(initialBook?.totalLikes || 0);
  const [likingInProgress, setLikingInProgress] = useState(false);

  useEffect(() => {
    if (initialBook) return; // Skip fetch if server-side data provided
    async function fetchData() {
      try {
        const bookRes = await fetch(`/api/books/${bookId}`);
        if (!bookRes.ok) throw new Error("Book not found");
        const bookData = await bookRes.json();
        setBook(bookData);
        setLiked(bookData.liked || false);
        setTotalLikes(bookData.totalLikes || 0);
      } catch {
        console.error("Failed to fetch book");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [bookId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll conversion status for pending/converting books
  useEffect(() => {
    if (!book) return;
    const status = book.conversionStatus;
    if (status !== "pending" && status !== "converting") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/books/${bookId}/convert`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.conversionStatus === "completed" || data.conversionStatus === "failed") {
          // Re-fetch full book data to get updated fileUrl
          const bookRes = await fetch(`/api/books/${bookId}`);
          if (bookRes.ok) {
            const bookData = await bookRes.json();
            setBook(bookData);
            if (data.conversionStatus === "completed") {
              toast.success(t("conversionCompleted"));
            }
          }
        }
      } catch {}
    }, 3000);

    return () => clearInterval(interval);
  }, [book?.conversionStatus, bookId]);

  useEffect(() => {
    if (!session?.user) return;
    Promise.all([
      fetch("/api/categories").then((r) => r.json()),
      fetch("/api/topics").then((r) => r.json()),
    ])
      .then(([cats, tops]) => {
        setAllCategories(cats);
        setAllTopics(tops);
      })
      .catch(() => {});
  }, [session]);

  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/shelves")
      .then((r) => r.json())
      .then((data) => setShelves(data))
      .catch(() => {});
  }, [session]);

  function startEditing() {
    if (!book) return;
    setEditTitle(book.title);
    setEditAuthor(book.author);
    setEditDescription(book.description || "");
    setSelectedCategoryIds(book.categories.map((c) => c.category.id));
    setSelectedTopicIds(book.topics.map((tp) => tp.topic.id));
    setIsEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/books/${bookId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          author: editAuthor,
          description: editDescription || undefined,
          categoryIds: selectedCategoryIds,
          topicIds: selectedTopicIds,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setBook((prev) => (prev ? { ...prev, ...updated } : prev));
        setIsEditing(false);
        toast.success(t("bookSaved"));
      } else {
        toast.error(t("saveFailed"));
      }
    } catch {
      toast.error(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/books/${bookId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(t("bookDeleted"));
        router.push("/library");
        router.refresh();
      } else {
        toast.error(t("deleteFailed"));
      }
    } catch {
      setDeleting(false);
    }
  }

  async function handleLikeToggle() {
    if (!session?.user) {
      toast.error(t("signInToRate"));
      return;
    }
    setLikingInProgress(true);
    try {
      const res = await fetch(`/api/books/${bookId}/like`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setLiked(data.liked);
        setTotalLikes(data.totalLikes);
      }
    } catch {
      toast.error(tc("error"));
    } finally {
      setLikingInProgress(false);
    }
  }

  async function handleReviewSubmit() {
    if (!reviewRating) {
      toast.error(t("provideRating"));
      return;
    }
    setSubmittingReview(true);
    try {
      if (editingReviewId) {
        // Update existing review
        const res = await fetch(
          `/api/books/${bookId}/reviews/${editingReviewId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              rating: reviewRating,
              text: reviewText || undefined,
            }),
          }
        );
        if (res.ok) {
          const updated = await res.json();
          setBook((prev) => {
            if (!prev) return prev;
            const reviews = prev.reviews.map((r) =>
              r.id === editingReviewId ? updated : r
            );
            const avg =
              reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
            return {
              ...prev,
              reviews,
              avgRating: Math.round(avg * 10) / 10,
            };
          });
          toast.success(t("ratingUpdated"));
        } else {
          toast.error(t("ratingUpdateFailed"));
        }
      } else {
        // Create new review
        const res = await fetch(`/api/books/${bookId}/reviews`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rating: reviewRating,
            text: reviewText || undefined,
          }),
        });
        if (res.ok) {
          const newReview = await res.json();
          setBook((prev) => {
            if (!prev) return prev;
            const reviews = [newReview, ...prev.reviews];
            const avg =
              reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
            return {
              ...prev,
              reviews,
              avgRating: Math.round(avg * 10) / 10,
            };
          });
          toast.success(t("ratingSubmitted"));
        } else {
          const err = await res.json();
          toast.error(err.error || t("ratingSubmitFailed"));
        }
      }
      setReviewRating(0);
      setReviewText("");
      setEditingReviewId(null);
    } catch {
      toast.error(tc("error"));
    } finally {
      setSubmittingReview(false);
    }
  }

  async function handleReviewDelete(reviewId: string) {
    try {
      const res = await fetch(
        `/api/books/${bookId}/reviews/${reviewId}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setBook((prev) => {
          if (!prev) return prev;
          const reviews = prev.reviews.filter((r) => r.id !== reviewId);
          const avg =
            reviews.length > 0
              ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
              : 0;
          return {
            ...prev,
            reviews,
            avgRating: Math.round(avg * 10) / 10,
          };
        });
        toast.success(t("ratingDeleted"));
      }
    } catch {
      toast.error(tc("error"));
    }
  }

  function startEditReview(review: Review) {
    setReviewRating(review.rating);
    setReviewText(review.text || "");
    setEditingReviewId(review.id);
  }

  async function handleReconvert() {
    setReconverting(true);
    try {
      const res = await fetch(`/api/books/${bookId}/convert`, { method: "POST" });
      if (res.ok) {
        setBook((prev) => prev ? { ...prev, conversionStatus: "converting" } : prev);
        toast.info(t("reconvert"));
      } else {
        const data = await res.json();
        toast.error(data.error || t("conversionFailed"));
      }
    } catch {
      toast.error(tc("error"));
    } finally {
      setReconverting(false);
    }
  }

  async function handleOfflineToggle() {
    if (!book) return;
    if (isOffline) {
      await removeOfflineBook(bookId);
      toast.success(t("removeOffline"));
    } else {
      setOfflineDownloading(true);
      try {
        await saveBookOffline(bookId, book.fileUrl, {
          title: book.title,
          author: book.author,
          coverUrl: book.coverUrl,
        });
        toast.success(t("availableOffline"));
      } catch {
        toast.error(tc("error"));
      } finally {
        setOfflineDownloading(false);
      }
    }
  }

  async function handleMetadataSearch() {
    if (!editTitle && !editAuthor) {
      toast.error(t("searchRequiresInput"));
      return;
    }
    setSearchingMetadata(true);
    setMetadataResults([]);
    setShowMetadataSearch(true);
    try {
      const res = await fetch("/api/books/metadata-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle || undefined, author: editAuthor || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        setMetadataResults(data.results || []);
        if ((data.results || []).length === 0) {
          toast.info(t("noMatchesOnline"));
        }
      } else {
        toast.error(t("metadataSearchError"));
      }
    } catch {
      toast.error(t("searchNetworkError"));
    } finally {
      setSearchingMetadata(false);
    }
  }

  async function applyMetadataResult(result: MetadataResult, index: number) {
    if (result.title) setEditTitle(result.title);
    if (result.author) setEditAuthor(result.author);
    if (result.description) setEditDescription(result.description);

    // Auto-match categories and topics
    const matched = matchCategoriesAndTopics(
      result.categories,
      result.title,
      result.author,
      result.description,
      allCategories,
      allTopics
    );

    if (matched.categoryIds.length > 0) {
      setSelectedCategoryIds((prev) => [...new Set([...prev, ...matched.categoryIds])]);
    }
    if (matched.topicIds.length > 0) {
      setSelectedTopicIds((prev) => [...new Set([...prev, ...matched.topicIds])]);
    }

    // Show auto-match feedback
    const parts: string[] = [];
    if (matched.categoryNames.length > 0) {
      parts.push(`Kategória: ${matched.categoryNames.join(", ")}`);
    }
    if (matched.topicNames.length > 0) {
      parts.push(`Téma: ${matched.topicNames.join(", ")}`);
    }
    if (parts.length > 0) {
      toast.info(`Auto-felismerés: ${parts.join(" | ")}`);
    }

    // Update cover if available - send to backend for download
    if (result.coverUrl) {
      setLoadingCover(index);
      try {
        const coverRes = await fetch(`/api/books/${bookId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ coverUrl: result.coverUrl }),
        });
        if (coverRes.ok) {
          const updated = await coverRes.json();
          setBook((prev) => (prev ? { ...prev, coverUrl: updated.coverUrl } : prev));
        }
      } catch {
        // Silent fail for cover update
      } finally {
        setLoadingCover(null);
      }
    }

    setShowMetadataSearch(false);
    toast.success(t("metadataApplied"));
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("hu-HU", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  const userAlreadyReviewed = book?.reviews.some(
    (r) => r.userId === session?.user?.id
  );

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-amber-200 border-t-amber-700" />
      </div>
    );
  }

  if (!book) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <p className="text-lg text-amber-700/70">{t("bookNotFound")}</p>
        <Link
          href="/library"
          className="mt-4 text-amber-600 underline hover:text-amber-700"
        >
          {t("backToLibrary")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Back link */}
      <Link
        href="/library"
        className="mb-6 inline-flex items-center gap-1 text-sm text-amber-700 hover:text-amber-600 dark:text-[var(--accent-gold)] dark:hover:text-[var(--accent-copper)]"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
            clipRule="evenodd"
          />
        </svg>
        {t("backToLibrary")}
      </Link>

      <motion.div
        className="overflow-hidden rounded-xl border border-amber-800/20 bg-amber-50/80 shadow-lg dark:bg-[var(--bg-card)] dark:border-[var(--border)]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex flex-col sm:flex-row">
          {/* Cover */}
          <div className="relative aspect-[2/3] w-full bg-gradient-to-br from-amber-800 to-amber-950 sm:w-64 sm:shrink-0">
            {book.coverUrl ? (
              <Image
                src={book.coverUrl}
                alt={book.title}
                fill
                className="object-cover"
                sizes="256px"
                {...(blurDataURL ? { placeholder: "blur", blurDataURL } : {})}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                <span className="text-6xl">📖</span>
                <p className="mt-4 text-lg font-bold text-amber-100">
                  {book.title}
                </p>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 p-6">
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-amber-800">
                    {t("titleLabel")}
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full rounded-lg border border-amber-800/20 bg-white px-3 py-2 text-sm outline-none focus:border-amber-600 dark:bg-[var(--bg-input)] dark:border-[var(--border)] dark:text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-amber-800">
                    {t("author")}
                  </label>
                  <input
                    type="text"
                    value={editAuthor}
                    onChange={(e) => setEditAuthor(e.target.value)}
                    className="w-full rounded-lg border border-amber-800/20 bg-white px-3 py-2 text-sm outline-none focus:border-amber-600 dark:bg-[var(--bg-input)] dark:border-[var(--border)] dark:text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-amber-800">
                    {t("descriptionLabel")}
                  </label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-amber-800/20 bg-white px-3 py-2 text-sm outline-none focus:border-amber-600 dark:bg-[var(--bg-input)] dark:border-[var(--border)] dark:text-[var(--text-primary)]"
                  />
                </div>
                {/* Online metadata search button */}
                {(editTitle || editAuthor) && (
                  <button
                    type="button"
                    onClick={handleMetadataSearch}
                    disabled={searchingMetadata}
                    className="w-full rounded-lg border-2 border-dashed border-amber-600/40 bg-amber-50/50 px-4 py-2 text-sm font-medium text-amber-700 transition-colors hover:border-amber-600 hover:bg-amber-50 disabled:opacity-50"
                  >
                    {searchingMetadata ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-300 border-t-amber-700" />
                        {t("searching")}
                      </span>
                    ) : (
                      t("searchOnline")
                    )}
                  </button>
                )}
                {/* Category chips */}
                <div>
                  <label className="mb-1 block text-xs font-semibold text-amber-800">
                    {t("categoriesLabel")}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {allCategories.map((cat) => {
                      const selected = selectedCategoryIds.includes(cat.id);
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() =>
                            setSelectedCategoryIds((prev) =>
                              selected
                                ? prev.filter((id) => id !== cat.id)
                                : [...prev, cat.id]
                            )
                          }
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                            selected
                              ? "bg-amber-700 text-white"
                              : "border border-amber-800/20 text-amber-800 hover:bg-amber-100"
                          }`}
                        >
                          {cat.icon && <span className="mr-1">{cat.icon}</span>}
                          {cat.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* Topic chips */}
                <div>
                  <label className="mb-1 block text-xs font-semibold text-amber-800">
                    {t("topicsLabel")}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {allTopics.map((topic) => {
                      const selected = selectedTopicIds.includes(topic.id);
                      return (
                        <button
                          key={topic.id}
                          type="button"
                          onClick={() =>
                            setSelectedTopicIds((prev) =>
                              selected
                                ? prev.filter((id) => id !== topic.id)
                                : [...prev, topic.id]
                            )
                          }
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                            selected
                              ? "text-white"
                              : "border border-amber-800/20 text-amber-800 hover:bg-amber-100"
                          }`}
                          style={
                            selected
                              ? { backgroundColor: topic.color || "#92400e" }
                              : {}
                          }
                        >
                          {topic.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* Save/Cancel buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-lg bg-amber-700 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                  >
                    {saving ? tc("saving") : tc("save")}
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="rounded-lg border border-amber-800/20 px-5 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50"
                  >
                    {tc("cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-[var(--text-primary)]">
                  {book.title}
                </h1>
                <p className="mt-1 text-lg text-[var(--text-secondary)]">
                  {book.author}
                </p>

                {/* Average rating + likes row */}
                <div className="mt-2 flex items-center gap-4">
                  {book.reviews.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <StarRating rating={book.avgRating} size="sm" />
                      <span className="text-sm font-medium text-amber-700">
                        {book.avgRating}
                      </span>
                      <span className="text-xs text-amber-700/60">
                        ({book.reviews.length} {t("ratings")})
                      </span>
                    </div>
                  )}
                  <button
                    onClick={handleLikeToggle}
                    disabled={likingInProgress}
                    className="inline-flex items-center gap-1 text-sm transition-colors disabled:opacity-50"
                    aria-label={t("like")}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-5 w-5 transition-colors ${liked ? "text-red-500" : "text-amber-400/60 hover:text-red-400"}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span
                      className={`font-medium ${liked ? "text-red-500" : "text-amber-700/60"}`}
                    >
                      {totalLikes}
                    </span>
                  </button>
                </div>

                {/* Uploader */}
                {book.user && (
                  <p className="mt-2 text-sm text-amber-700/60">
                    {t("uploadedBy")}{" "}
                    <Link
                      href={`/user/${book.user.id}`}
                      className="font-medium text-amber-700 hover:text-amber-600 hover:underline"
                    >
                      {book.user.name || t("unknownAuthor")}
                    </Link>
                  </p>
                )}

                {/* Categories */}
                {book.categories.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {book.categories.map(({ category }) => (
                      <span
                        key={category.id}
                        className="rounded-full bg-amber-200/60 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-800/30 dark:text-[var(--accent-gold)]"
                      >
                        {category.name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Topics */}
                {book.topics.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {book.topics.map(({ topic }) => (
                      <span
                        key={topic.id}
                        className="rounded-full px-3 py-1 text-xs font-medium"
                        style={{
                          backgroundColor: topic.color
                            ? `${topic.color}20`
                            : "#d4a37420",
                          color: topic.color || "#92400e",
                        }}
                      >
                        {topic.name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Description */}
                {book.description && (
                  <div className="mt-4">
                    <div className="relative">
                      <p
                        className="text-sm leading-relaxed text-[var(--text-secondary)]"
                        style={
                          !descExpanded && book.description.length > 300
                            ? { maxHeight: "8.5em", overflow: "hidden" }
                            : undefined
                        }
                      >
                        {book.description}
                      </p>
                      {!descExpanded && book.description.length > 300 && (
                        <div
                          className="pointer-events-none absolute inset-x-0 bottom-0"
                          style={{
                            height: "3rem",
                            background: "linear-gradient(to top, rgba(255,251,235,0.95), transparent)",
                          }}
                        />
                      )}
                    </div>
                    {book.description.length > 300 && (
                      <button
                        onClick={() => setDescExpanded(!descExpanded)}
                        className="mt-1 text-xs font-medium text-amber-700 hover:text-amber-600 hover:underline dark:text-[var(--accent-gold)] dark:hover:text-[var(--accent-copper)]"
                      >
                        {descExpanded ? t("readLess") : t("readMore")}
                      </button>
                    )}
                  </div>
                )}

                {/* Metadata */}
                <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-[var(--text-muted)]">{t("format")}</span>{" "}
                    <span className="font-medium uppercase text-[var(--text-primary)]">
                      {book.originalFormat}
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)]">{t("size")}</span>{" "}
                    <span className="font-medium text-[var(--text-primary)]">
                      {formatFileSize(book.fileSize)}
                    </span>
                  </div>
                  {book.language && (
                    <div>
                      <span className="text-[var(--text-muted)]">{t("bookLanguage")}</span>{" "}
                      <span className="font-medium text-[var(--text-primary)]">
                        {book.language}
                      </span>
                    </div>
                  )}
                  {book.pageCount && (
                    <div>
                      <span className="text-[var(--text-muted)]">
                        {t("pageCount")}
                      </span>{" "}
                      <span className="font-medium text-[var(--text-primary)]">
                        {book.pageCount}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-[var(--text-muted)]">{t("views")}</span>{" "}
                    <span className="font-medium text-[var(--text-primary)]">
                      {book.viewCount || 0}
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--text-muted)]">{t("downloads")}</span>{" "}
                    <span className="font-medium text-[var(--text-primary)]">
                      {book.downloadCount || 0}
                    </span>
                  </div>
                </div>

                {/* Reading progress */}
                {book.readingProgress &&
                  book.readingProgress.percentage > 0 && (
                    <div className="mt-6">
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="text-[var(--text-muted)]">
                          {t("readingProgress")}
                        </span>
                        <span className="font-medium text-amber-700">
                          {Math.round(book.readingProgress.percentage)}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-amber-200/50 dark:bg-amber-900/40">
                        <div
                          className="h-full rounded-full bg-amber-700 transition-all"
                          style={{
                            width: `${book.readingProgress.percentage}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                {/* Action buttons */}
                <div className="mt-6 flex flex-wrap gap-3">
                  {/* Reader button: EPUB or successfully converted */}
                {(book.originalFormat === "epub" || book.conversionStatus === "completed") && (
                    <Link
                      href={`/reader/${book.id}`}
                      className="inline-flex items-center gap-2 rounded-lg bg-amber-700 px-5 py-2.5 font-semibold text-white shadow transition-colors hover:bg-amber-600"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
                      </svg>
                      {book.readingProgress &&
                      book.readingProgress.percentage > 0
                        ? t("continueReading")
                        : t("read")}
                    </Link>
                  )}

                  {/* Conversion status indicators */}
                  {book.conversionStatus === "pending" && (
                    <span className="inline-flex items-center gap-2 rounded-lg bg-amber-100 px-5 py-2.5 text-sm font-medium text-amber-700">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-300 border-t-amber-700" />
                      {t("conversionPending")}
                    </span>
                  )}
                  {book.conversionStatus === "converting" && (
                    <span className="inline-flex items-center gap-2 rounded-lg bg-blue-100 px-5 py-2.5 text-sm font-medium text-blue-700">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" />
                      {t("conversionInProgress")}
                    </span>
                  )}
                  {book.conversionStatus === "failed" && (
                    <span className="inline-flex items-center gap-2 rounded-lg bg-red-100 px-5 py-2.5 text-sm font-medium text-red-600">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      {t("conversionFailed")}
                    </span>
                  )}

                  {/* Re-convert button for non-EPUB books (owner only) */}
                  {book.isOwner && book.originalFormat !== "epub" &&
                    (book.conversionStatus === "completed" || book.conversionStatus === "failed") && (
                    <button
                      onClick={handleReconvert}
                      disabled={reconverting}
                      className="inline-flex items-center gap-2 rounded-lg border border-amber-800/20 bg-white px-4 py-2.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-50 disabled:opacity-50"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                      </svg>
                      {reconverting ? t("reconvert") + "..." : t("reconvert")}
                    </button>
                  )}

                  {/* Download: use original file URL if available */}
                  <a
                    href={book.originalFileUrl || book.fileUrl}
                    download
                    onClick={() => {
                      fetch(`/api/books/${bookId}/download`, { method: "POST" }).catch(() => {});
                      setBook((prev) => prev ? { ...prev, downloadCount: (prev.downloadCount || 0) + 1 } : prev);
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-amber-800/20 bg-white px-5 py-2.5 font-semibold text-amber-800 shadow-sm transition-colors hover:bg-amber-50 dark:bg-[var(--bg-secondary)] dark:text-[var(--text-primary)] dark:border-[var(--border)] dark:hover:bg-amber-900/30"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {t("download")}
                  </a>

                  {/* Offline download button */}
                  {(book.originalFormat === "epub" || book.conversionStatus === "completed") && (
                    <button
                      onClick={handleOfflineToggle}
                      disabled={offlineDownloading}
                      className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                        isOffline
                          ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30"
                          : "border-amber-800/20 bg-white text-amber-800 hover:bg-amber-50 dark:bg-[var(--bg-secondary)] dark:text-[var(--text-primary)] dark:border-[var(--border)] dark:hover:bg-amber-900/30"
                      } disabled:opacity-50`}
                    >
                      {offlineDownloading ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      ) : isOffline ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      )}
                      {offlineDownloading
                        ? t("downloadingOffline")
                        : isOffline
                          ? t("availableOffline")
                          : t("downloadOffline")}
                    </button>
                  )}

                  {/* Owner-only buttons */}
                  {book.isOwner && (
                    <>
                      <button
                        onClick={startEditing}
                        className="inline-flex items-center gap-2 rounded-lg border border-amber-800/20 bg-white px-4 py-2.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-50 dark:bg-[var(--bg-secondary)] dark:text-[var(--text-primary)] dark:border-[var(--border)] dark:hover:bg-amber-900/30"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                        {t("editBook")}
                      </button>

                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                      >
                        {t("deleteBook")}
                      </button>
                    </>
                  )}

                  {/* Share button (owner only) */}
                  {book.isOwner && (
                    <button
                      onClick={async () => {
                        setSharingInProgress(true);
                        try {
                          const res = await fetch(`/api/books/${bookId}/share`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                          });
                          if (res.ok) {
                            const data = await res.json();
                            setShareUrl(window.location.origin + data.url);
                            setShowShareModal(true);
                          }
                        } catch {
                          toast.error(tc("error"));
                        } finally {
                          setSharingInProgress(false);
                        }
                      }}
                      disabled={sharingInProgress}
                      className="inline-flex items-center gap-2 rounded-lg border border-amber-800/20 bg-white px-4 py-2.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-50 disabled:opacity-50 dark:bg-[var(--bg-secondary)] dark:text-[var(--text-primary)] dark:border-[var(--border)] dark:hover:bg-amber-900/30"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
                      </svg>
                      {t("share")}
                    </button>
                  )}

                  {/* Save to library (non-owner only) */}
                  {session?.user && book && !book.isOwner && (
                    <SaveToLibraryButton
                      bookId={bookId}
                      isOwned={book.isOwner}
                      initialSaved={book.saved}
                      variant="full"
                    />
                  )}

                  {/* Shelf picker (authenticated only) */}
                  {session?.user && (
                    <div className="relative">
                      <button
                        onClick={() => setShowShelfPicker(!showShelfPicker)}
                        className="inline-flex items-center gap-2 rounded-lg border border-amber-800/20 bg-white px-4 py-2.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-50 dark:bg-[var(--bg-secondary)] dark:text-[var(--text-primary)] dark:border-[var(--border)] dark:hover:bg-amber-900/30"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM14 11a1 1 0 011 1v1h1a1 1 0 110 2h-1v1a1 1 0 11-2 0v-1h-1a1 1 0 110-2h1v-1a1 1 0 011-1z" />
                        </svg>
                        {t("addToShelf")}
                      </button>
                      {showShelfPicker && (
                        <>
                        <div className="fixed inset-0 z-30" onClick={() => setShowShelfPicker(false)} />
                        <div className="absolute bottom-full left-0 z-40 mb-1 w-56 rounded-lg border border-amber-800/20 bg-white py-1 shadow-xl dark:bg-[var(--bg-card)] dark:border-[var(--border)]">
                          {shelves.length === 0 ? (
                            <p className="px-3 py-2 text-sm text-amber-700/60">
                              {t("noShelvesYet")}
                            </p>
                          ) : (
                            shelves.map((shelf) => (
                              <button
                                key={shelf.id}
                                onClick={async () => {
                                  setAddingToShelf(shelf.id);
                                  try {
                                    const res = await fetch(
                                      `/api/shelves/${shelf.id}`,
                                      {
                                        method: "POST",
                                        headers: {
                                          "Content-Type": "application/json",
                                        },
                                        body: JSON.stringify({ bookId }),
                                      }
                                    );
                                    if (res.ok) {
                                      toast.success(
                                        t("addedToShelf")
                                      );
                                    } else {
                                      toast.error(
                                        t("addToShelfFailed")
                                      );
                                    }
                                    setShowShelfPicker(false);
                                  } catch {
                                    toast.error(
                                      t("addToShelfFailed")
                                    );
                                  }
                                  setAddingToShelf(null);
                                }}
                                disabled={addingToShelf === shelf.id}
                                className="flex w-full items-center px-3 py-2 text-left text-sm text-amber-800 transition-colors hover:bg-amber-50 disabled:opacity-50 dark:text-[var(--text-primary)] dark:hover:bg-amber-900/30"
                              >
                                {addingToShelf === shelf.id
                                  ? t("adding")
                                  : shelf.name}
                              </button>
                            ))
                          )}
                        </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </motion.div>

      {/* Reviews section */}
      <motion.div
        className="mt-8 rounded-xl border border-amber-800/20 bg-amber-50/80 p-6 shadow-lg dark:bg-[var(--bg-card)] dark:border-[var(--border)]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <h2 className="text-xl font-bold text-[var(--text-primary)]">
          {t("ratings")}
        </h2>

        {/* Review form (authenticated, not yet reviewed or editing) */}
        {session?.user && (!userAlreadyReviewed || editingReviewId) && (
          <div className="mt-4 rounded-lg border border-amber-800/10 bg-white p-4 dark:bg-[var(--bg-secondary)] dark:border-[var(--border)] dark:bg-[var(--bg-secondary)] dark:border-[var(--border)]">
            <p className="mb-2 text-sm font-medium text-amber-800">
              {editingReviewId
                ? t("editRating")
                : t("writeReview")}
            </p>
            <div className="flex items-center gap-2">
              <StarRating rating={reviewRating} onRate={setReviewRating} />
              {reviewRating > 0 && (
                <span className="text-sm text-amber-700">
                  {reviewRating}/5
                </span>
              )}
            </div>
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder={t("reviewPlaceholder")}
              rows={3}
              className="mt-3 w-full rounded-lg border border-amber-800/20 bg-amber-50/50 px-3 py-2 text-sm outline-none focus:border-amber-600 dark:bg-[var(--bg-input)] dark:border-[var(--border)] dark:text-[var(--text-primary)]"
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleReviewSubmit}
                disabled={submittingReview || !reviewRating}
                className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {submittingReview
                  ? tc("saving")
                  : editingReviewId
                    ? t("updateRating")
                    : t("submitRating")}
              </button>
              {editingReviewId && (
                <button
                  onClick={() => {
                    setEditingReviewId(null);
                    setReviewRating(0);
                    setReviewText("");
                  }}
                  className="rounded-lg border border-amber-800/20 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50"
                >
                  {tc("cancel")}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Not logged in hint */}
        {!session?.user && (
          <p className="mt-3 text-sm text-amber-700/60">
            <Link
              href="/login"
              className="font-medium text-amber-700 hover:underline"
            >
              {t("signInToRate")}
            </Link>{" "}
            {t("toRate")}
          </p>
        )}

        {/* Reviews list */}
        {book.reviews.length === 0 ? (
          <p className="mt-4 text-sm text-amber-700/50">
            {t("noRatingsYet")}
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <AnimatePresence>
              {book.reviews.map((review) => (
                <motion.div
                  key={review.id}
                  className="rounded-lg border border-amber-800/10 bg-white p-4 dark:bg-[var(--bg-secondary)] dark:border-[var(--border)]"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/user/${review.userId}`}
                          className="text-sm font-semibold text-amber-800 hover:underline"
                        >
                          {review.user.name || t("unknownAuthor")}
                        </Link>
                        <StarRating rating={review.rating} size="sm" />
                      </div>
                      <p className="mt-0.5 text-xs text-amber-700/50">
                        {formatDate(review.createdAt)}
                      </p>
                    </div>
                    {/* Edit/delete for own review or admin */}
                    {(review.userId === session?.user?.id ||
                      session?.user?.role === "ADMIN") && (
                      <div className="flex gap-1">
                        {review.userId === session?.user?.id && (
                          <button
                            onClick={() => startEditReview(review)}
                            className="rounded p-1 text-amber-600 hover:bg-amber-100"
                            title={tc("edit")}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={() => handleReviewDelete(review.id)}
                          className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"
                          title={tc("delete")}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                  {review.text && (
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                      {review.text}
                    </p>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {/* Comments section */}
      <motion.div
        className="mt-8 rounded-xl border border-amber-800/20 bg-amber-50/80 p-6 shadow-lg dark:bg-[var(--bg-card)] dark:border-[var(--border)]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        <CommentSection bookId={bookId} />
      </motion.div>

      {/* Recommendations section */}
      <div className="mt-8">
        <RecommendationSection bookId={bookId} />
      </div>

      {/* Share modal */}
      <AnimatePresence>
        {showShareModal && shareUrl && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowShareModal(false)}
          >
            <motion.div
              className="w-full max-w-md rounded-xl border border-amber-800/20 bg-white p-6 shadow-xl dark:bg-[var(--bg-card)] dark:border-[var(--border)]"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-3 text-lg font-bold text-[var(--text-primary)]">{t("shareTitle")}</h3>
              <p className="mb-3 text-sm text-[var(--text-muted)]">{t("shareDesc")}</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 rounded-lg border border-amber-800/20 bg-amber-50/50 px-3 py-2 text-sm text-[var(--text-primary)] dark:bg-[var(--bg-input)] dark:border-[var(--border)]"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(shareUrl);
                    toast.success(t("linkCopied"));
                  }}
                  className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
                >
                  {t("copyLink")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirmation modal */}
      {/* Online metadata search results modal */}
      {showMetadataSearch && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowMetadataSearch(false)}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-amber-800/20 bg-white p-6 shadow-2xl dark:bg-[var(--bg-card)] dark:border-[var(--border)]"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-amber-900">
                {t("metadataResults")}
              </h3>
              <button
                onClick={() => setShowMetadataSearch(false)}
                className="rounded-lg p-1.5 text-amber-700/60 transition-colors hover:bg-amber-100 hover:text-amber-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {searchingMetadata ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-amber-200 border-t-amber-700" />
                  <p className="text-sm text-amber-700/70">
                    {t("searchingDatabases")}
                  </p>
                </div>
              </div>
            ) : metadataResults.length === 0 ? (
              <div className="py-8 text-center text-[var(--text-muted)]">
                {t("noMatchesTryAgain")}
              </div>
            ) : (
              <div className="space-y-3">
                {metadataResults.map((result, i) => (
                  <div
                    key={`${result.source}-${i}`}
                    className="flex gap-4 rounded-xl border border-amber-800/20 bg-amber-50/30 p-4 transition-colors hover:bg-amber-50 dark:bg-[var(--bg-secondary)] dark:border-[var(--border)] dark:hover:bg-amber-900/30"
                  >
                    {/* Cover thumbnail */}
                    <div className="flex h-24 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-amber-200/50 dark:bg-amber-900/40">
                      {result.coverUrl ? (
                        <Image
                          src={result.coverUrl}
                          alt={result.title}
                          width={64}
                          height={96}
                          className="h-full w-full object-cover"
                          unoptimized
                        />
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
                        </svg>
                      )}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[var(--text-primary)]">
                        {result.title}
                      </p>
                      {result.author && (
                        <p className="text-sm text-[var(--text-secondary)]">
                          {result.author}
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {result.publishedYear && (
                          <span className="text-xs text-[var(--text-muted)]">
                            {result.publishedYear}
                          </span>
                        )}
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          result.source === "google"
                            ? "bg-green-100 text-green-700"
                            : "bg-blue-100 text-blue-700"
                        }`}>
                          {result.source === "google" ? "Google Books" : "Hardcover"}
                        </span>
                        {result.rating && (
                          <span className="text-xs text-amber-600">
                            {result.rating}/5
                          </span>
                        )}
                      </div>
                      {result.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">
                          {result.description}
                        </p>
                      )}
                    </div>

                    {/* Apply button */}
                    <div className="flex shrink-0 items-center">
                      <button
                        type="button"
                        onClick={() => applyMetadataResult(result, i)}
                        disabled={loadingCover === i}
                        className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
                      >
                        {loadingCover === i ? (
                          <span className="flex items-center gap-1">
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-300 border-t-white" />
                          </span>
                        ) : (
                          t("applyBtn")
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      )}

      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowDeleteConfirm(false)}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl dark:bg-[var(--bg-card)]"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-gray-900 dark:text-[var(--text-primary)]">{t("deleteBook")}</h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-[var(--text-muted)]">
              {t("confirmDeleteBook", { title: book.title })}{" "}
              {tc("undoWarning")}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {tc("cancel")}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deleting ? tc("deleting") : tc("delete")}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
