"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { toast } from "sonner";
import BookCover from "@/components/bookshelf/BookCover";
import { useTranslations } from "next-intl";

interface Topic {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  createdById: string | null;
  _count: { books: number };
}

interface Book {
  id: string;
  title: string;
  author: string;
  coverUrl: string | null;
  blurHash: string | null;
  originalFormat: string;
  readingProgress?: { percentage: number } | null;
}

const PRESET_COLORS = [
  "#DC2626", "#7C3AED", "#059669", "#EC4899", "#F59E0B",
  "#1F2937", "#3B82F6", "#EAB308", "#06B6D4", "#8B5CF6",
  "#92400E", "#0891B2", "#16A34A", "#2563EB",
];

export default function TopicsView() {
  const { data: session } = useSession();
  const t = useTranslations("topics");
  const tc = useTranslations("common");
  const ta = useTranslations("auth");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [booksLoading, setBooksLoading] = useState(false);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [creating, setCreating] = useState(false);

  // Edit modal state
  const [editTopic, setEditTopic] = useState<Topic | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchTopics = useCallback(async () => {
    try {
      const res = await fetch("/api/topics");
      const data = await res.json();
      setTopics(data);
    } catch {
      console.error("Failed to fetch topics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  // Fetch books when selectedTopic changes
  useEffect(() => {
    if (!selectedTopic) {
      setBooks([]);
      return;
    }

    const slug = selectedTopic.slug;
    async function fetchBooks() {
      setBooksLoading(true);
      try {
        if (session) {
          const res = await fetch(`/api/books?topic=${slug}`);
          const data = await res.json();
          setBooks(data.books || []);
        } else {
          setBooks([]);
        }
      } catch {
        console.error("Failed to fetch books for topic");
        setBooks([]);
      } finally {
        setBooksLoading(false);
      }
    }
    fetchBooks();
  }, [selectedTopic, session]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      });
      if (res.ok) {
        setNewName("");
        setNewColor(PRESET_COLORS[0]);
        setShowCreateModal(false);
        await fetchTopics();
        toast.success(t("topicCreated"));
      } else {
        toast.error(t("createFailed"));
      }
    } catch {
      toast.error(tc("error"));
    } finally {
      setCreating(false);
    }
  }

  function openEdit(topic: Topic) {
    setEditTopic(topic);
    setEditName(topic.name);
    setEditColor(topic.color || PRESET_COLORS[0]);
  }

  async function handleSaveEdit() {
    if (!editTopic || !editName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/topics/${editTopic.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), color: editColor }),
      });
      if (res.ok) {
        await fetchTopics();
        setEditTopic(null);
        toast.success(t("topicUpdated"));
      } else {
        toast.error(t("updateFailed"));
      }
    } catch {
      toast.error(tc("error"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-amber-200 border-t-amber-700" />
          <p className="text-amber-700/70">{t("loadingTopics")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">{t("title")}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {t("subtitle")}
          </p>
        </div>
        {session && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-700 px-5 py-2.5 font-semibold text-white shadow transition-colors hover:bg-amber-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            {t("createNew")}
          </button>
        )}
      </div>

      {/* Topics Grid */}
      {topics.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {topics.map((topic) => (
            <motion.div
              key={topic.id}
              whileHover={{ y: -2 }}
              transition={{ type: "spring", stiffness: 400 }}
              className={`group relative rounded-xl border-l-4 bg-white dark:bg-[var(--bg-card)] p-4 shadow-sm transition-all hover:shadow-md ${
                selectedTopic?.id === topic.id
                  ? "ring-2 ring-amber-500"
                  : "border border-amber-800/10 dark:border-[var(--border)]"
              }`}
              style={{ borderLeftColor: topic.color || "#C9A96E" }}
            >
              <button
                onClick={() =>
                  setSelectedTopic((prev) =>
                    prev?.id === topic.id ? null : topic
                  )
                }
                className="w-full text-left"
              >
                <p className="font-bold text-[var(--text-primary)]">{topic.name}</p>
                {topic.description && (
                  <p className="mt-1 text-xs text-[var(--text-muted)] line-clamp-2">
                    {topic.description}
                  </p>
                )}
                <span className="mt-2 inline-block rounded-full bg-amber-100 dark:bg-amber-900/30 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-[var(--accent-gold)]">
                  {topic._count.books} {tc("books")}
                </span>
              </button>

              {/* Edit button - only for creator or admin */}
              {session && (topic.createdById === session.user?.id || session.user?.role === "ADMIN") && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openEdit(topic);
                  }}
                  className="absolute right-2 top-2 rounded-lg p-1.5 text-amber-700/30 opacity-100 transition-all hover:bg-amber-50 dark:hover:bg-[var(--bg-secondary)] hover:text-amber-700 sm:opacity-0 sm:group-hover:opacity-100"
                  title={t("editTitle")}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                  </svg>
                </button>
              )}
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="py-20 text-center">
          <p className="text-lg text-amber-700/60 dark:text-[var(--text-muted)]">{t("noTopics")}</p>
        </div>
      )}

      {/* Selected Topic Books */}
      <AnimatePresence mode="wait">
        {selectedTopic && (
          <motion.div
            key={selectedTopic.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-8 overflow-hidden rounded-xl border border-amber-800/20 bg-amber-50/80 dark:bg-[var(--bg-card)] dark:border-[var(--border)] p-6"
          >
            {/* Header row */}
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xl font-bold text-[var(--text-primary)]">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{
                    backgroundColor: selectedTopic.color || "#C9A96E",
                  }}
                />
                {t("booksInTopic", { name: selectedTopic.name })}
              </h2>
              <button
                onClick={() => setSelectedTopic(null)}
                className="rounded-lg p-1.5 text-amber-700/60 transition-colors hover:bg-amber-200/50 dark:hover:bg-[var(--bg-secondary)] hover:text-amber-900 dark:hover:text-[var(--text-primary)]"
                aria-label={tc("close")}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="mt-4">
              {booksLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-200 border-t-amber-700" />
                </div>
              ) : !session ? (
                <div className="py-8 text-center">
                  <p className="text-amber-700/70">
                    {t("loginToView")}
                  </p>
                  <Link
                    href="/login"
                    className="mt-3 inline-block rounded-lg bg-amber-700 px-5 py-2 font-semibold text-white transition-colors hover:bg-amber-600"
                  >
                    {ta("login")}
                  </Link>
                </div>
              ) : books.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-amber-700/60">
                    {t("noBooksInTopic")}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {books.map((book) => (
                    <BookCover
                      key={book.id}
                      id={book.id}
                      title={book.title}
                      author={book.author}
                      coverUrl={book.coverUrl}
                      blurHash={book.blurHash}
                      format={book.originalFormat}
                      progress={book.readingProgress?.percentage}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => {
              setShowCreateModal(false);
              setNewName("");
            }}
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              className="w-full max-w-md rounded-xl bg-white dark:bg-[var(--bg-card)] p-6 shadow-2xl"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-gray-900 dark:text-[var(--text-primary)]">{t("createTitle")}</h3>

              <div className="mt-4 space-y-4">
                <div>
                  <label htmlFor="topic-name" className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)]">
                    {t("topicName")}
                  </label>
                  <input
                    id="topic-name"
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                    }}
                    placeholder={t("topicNamePlaceholder")}
                    className="mt-1 w-full rounded-lg border border-amber-800/20 bg-amber-50/50 dark:bg-[var(--bg-input)] px-3 py-2 text-sm text-gray-900 dark:text-[var(--text-primary)] outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)]">{t("color")}</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setNewColor(color)}
                        className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${
                          newColor === color ? "border-gray-900 dark:border-white scale-110" : "border-transparent"
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewName("");
                  }}
                  className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)] hover:bg-gray-50"
                >
                  {tc("cancel")}
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating || !newName.trim()}
                  className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                >
                  {creating ? tc("creating") : tc("create")}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit modal */}
      <AnimatePresence>
        {editTopic && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setEditTopic(null)}
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              className="w-full max-w-md rounded-xl bg-white dark:bg-[var(--bg-card)] p-6 shadow-2xl"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-gray-900 dark:text-[var(--text-primary)]">{t("editTitle")}</h3>

              <div className="mt-4 space-y-4">
                <div>
                  <label htmlFor="edit-topic-name" className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)]">
                    {t("topicName")}
                  </label>
                  <input
                    id="edit-topic-name"
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEdit();
                    }}
                    className="mt-1 w-full rounded-lg border border-amber-800/20 bg-amber-50/50 dark:bg-[var(--bg-input)] px-3 py-2 text-sm text-gray-900 dark:text-[var(--text-primary)] outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)]">{t("color")}</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {PRESET_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setEditColor(color)}
                        className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${
                          editColor === color ? "border-gray-900 dark:border-white scale-110" : "border-transparent"
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setEditTopic(null)}
                  className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)] hover:bg-gray-50"
                >
                  {tc("cancel")}
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving || !editName.trim()}
                  className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                >
                  {saving ? tc("saving") : tc("save")}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
