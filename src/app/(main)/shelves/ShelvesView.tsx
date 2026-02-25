"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface ShelfBook {
  book: {
    id: string;
    title: string;
    author: string | null;
    coverUrl: string | null;
  };
}

interface Shelf {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  books: ShelfBook[];
  _count: { books: number };
}

export default function ShelvesView() {
  const t = useTranslations("shelves");
  const tc = useTranslations("common");
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editShelf, setEditShelf] = useState<Shelf | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchShelves = useCallback(async () => {
    try {
      const res = await fetch("/api/shelves");
      if (res.ok) {
        const data = await res.json();
        setShelves(data);
      }
    } catch {
      console.error("Failed to fetch shelves");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShelves();
  }, [fetchShelves]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/shelves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim() || undefined,
        }),
      });
      if (res.ok) {
        setNewName("");
        setNewDescription("");
        setShowCreateModal(false);
        await fetchShelves();
        toast.success(t("shelfCreated"));
      } else {
        toast.error(t("createFailed"));
      }
    } catch {
      toast.error(t("createFailed"));
    } finally {
      setCreating(false);
    }
  }

  function openEdit(shelf: Shelf) {
    setEditShelf(shelf);
    setEditName(shelf.name);
    setEditDescription(shelf.description || "");
  }

  async function handleSaveEdit() {
    if (!editShelf || !editName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/shelves/${editShelf.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || null,
        }),
      });
      if (res.ok) {
        setShelves((prev) =>
          prev.map((s) =>
            s.id === editShelf.id
              ? { ...s, name: editName.trim(), description: editDescription.trim() || null }
              : s
          )
        );
        setEditShelf(null);
        toast.success(t("shelfUpdated"));
      } else {
        toast.error(t("updateFailed"));
      }
    } catch {
      toast.error(tc("error"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/shelves/${id}`, { method: "DELETE" });
      if (res.ok) {
        setShelves((prev) => prev.filter((s) => s.id !== id));
        toast.success(t("shelfDeleted"));
      } else {
        toast.error(t("deleteFailed"));
      }
    } catch {
      toast.error(t("deleteFailed"));
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-amber-200 border-t-amber-700" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-[var(--text-primary)]">{t("title")}</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-700 px-5 py-2.5 font-semibold text-white shadow transition-colors hover:bg-amber-600"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          {t("createNew")}
        </button>
      </div>

      {/* Shelves grid */}
      {shelves.length === 0 ? (
        <motion.div
          className="flex min-h-[40vh] flex-col items-center justify-center rounded-xl border border-amber-800/20 bg-amber-50/80 dark:bg-[var(--bg-card)] dark:border-[var(--border)] p-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <span className="text-6xl">📚</span>
          <p className="mt-4 text-lg text-amber-700/70">{t("noShelvesYet")}</p>
          <p className="mt-1 text-sm text-amber-700/50">
            {t("noShelvesDesc")}
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-amber-700 px-5 py-2.5 font-semibold text-white shadow transition-colors hover:bg-amber-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            {t("createNew")}
          </button>
        </motion.div>
      ) : (
        <motion.div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ staggerChildren: 0.05 }}
        >
          <AnimatePresence>
            {shelves.map((shelf, index) => (
              <motion.div
                key={shelf.id}
                className="group relative overflow-hidden rounded-xl border border-amber-800/20 bg-amber-50/80 dark:bg-[var(--bg-card)] dark:border-[var(--border)] shadow-md transition-shadow hover:shadow-lg"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: index * 0.05 }}
              >
                <Link href={`/shelves/${shelf.id}`} className="block p-5">
                  <h2 className="text-lg font-bold text-[var(--text-primary)]">{shelf.name}</h2>

                  {shelf.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-[var(--text-secondary)]">
                      {shelf.description}
                    </p>
                  )}

                  <p className="mt-2 text-sm text-amber-700/70 dark:text-[var(--text-muted)]">
                    {shelf._count.books} {tc("books")}
                  </p>

                  <div className="mt-3 flex items-center gap-1.5">
                    {shelf.books.slice(0, 5).map((sb) => (
                      <div
                        key={sb.book.id}
                        className="relative h-14 w-10 overflow-hidden rounded-sm border border-amber-800/20 bg-gradient-to-br from-amber-800 to-amber-950 shadow-sm"
                      >
                        {sb.book.coverUrl ? (
                          <Image
                            src={sb.book.coverUrl}
                            alt={sb.book.title}
                            fill
                            className="object-cover"
                            sizes="40px"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <span className="text-xs">📖</span>
                          </div>
                        )}
                      </div>
                    ))}
                    {shelf._count.books > 5 && (
                      <span className="ml-1 text-xs text-amber-700/60 dark:text-[var(--text-muted)]">
                        +{shelf._count.books - 5}
                      </span>
                    )}
                  </div>
                </Link>

                {/* Action buttons */}
                <div className="absolute right-2 top-2 flex gap-1 opacity-100 sm:opacity-0 transition-all sm:group-hover:opacity-100">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      openEdit(shelf);
                    }}
                    className="rounded-lg p-1.5 text-amber-700/40 transition-all hover:bg-amber-50 dark:hover:bg-[var(--bg-secondary)] hover:text-amber-700"
                    title={t("editTitle")}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDeleteId(shelf.id);
                    }}
                    className="rounded-lg p-1.5 text-amber-700/40 transition-all hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-500"
                    title={t("deleteTitle")}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Create modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => {
              setShowCreateModal(false);
              setNewName("");
              setNewDescription("");
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
                  <label htmlFor="shelf-name" className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)]">
                    {t("shelfName")}
                  </label>
                  <input
                    id="shelf-name"
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreate();
                    }}
                    placeholder={t("shelfNamePlaceholder")}
                    className="mt-1 w-full rounded-lg border border-amber-800/20 bg-amber-50/50 dark:bg-[var(--bg-input)] px-3 py-2 text-sm text-gray-900 dark:text-[var(--text-primary)] outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50"
                    autoFocus
                  />
                </div>
                <div>
                  <label htmlFor="shelf-desc" className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)]">
                    {t("descriptionOptional")}
                  </label>
                  <textarea
                    id="shelf-desc"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    rows={3}
                    placeholder={t("descriptionPlaceholder")}
                    className="mt-1 w-full rounded-lg border border-amber-800/20 bg-amber-50/50 dark:bg-[var(--bg-input)] px-3 py-2 text-sm text-gray-900 dark:text-[var(--text-primary)] outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewName("");
                    setNewDescription("");
                  }}
                  className="rounded-lg border dark:border-[var(--border)] px-4 py-2 text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)] hover:bg-gray-50 dark:hover:bg-[var(--bg-secondary)]"
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
        {editShelf && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setEditShelf(null)}
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
                  <label htmlFor="edit-name" className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)]">
                    {t("shelfName")}
                  </label>
                  <input
                    id="edit-name"
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
                  <label htmlFor="edit-desc" className="block text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)]">
                    {t("descriptionOptional")}
                  </label>
                  <textarea
                    id="edit-desc"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-amber-800/20 bg-amber-50/50 dark:bg-[var(--bg-input)] px-3 py-2 text-sm text-gray-900 dark:text-[var(--text-primary)] outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setEditShelf(null)}
                  className="rounded-lg border dark:border-[var(--border)] px-4 py-2 text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)] hover:bg-gray-50 dark:hover:bg-[var(--bg-secondary)]"
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

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {deleteId && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setDeleteId(null)}
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              className="w-full max-w-sm rounded-xl bg-white dark:bg-[var(--bg-card)] p-6 shadow-2xl"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-gray-900 dark:text-[var(--text-primary)]">{t("deleteTitle")}</h3>
              <p className="mt-2 text-sm text-gray-600 dark:text-[var(--text-muted)]">
                {t("deleteConfirm")}
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setDeleteId(null)}
                  className="rounded-lg border dark:border-[var(--border)] px-4 py-2 text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)] hover:bg-gray-50 dark:hover:bg-[var(--bg-secondary)]"
                >
                  {tc("cancel")}
                </button>
                <button
                  onClick={() => handleDelete(deleteId)}
                  disabled={deleting}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {deleting ? tc("deleting") : tc("delete")}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
