"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import CommentCard, { type CommentData } from "./CommentCard";

interface CommentSectionProps {
  bookId: string;
}

export default function CommentSection({ bookId }: CommentSectionProps) {
  const { data: session } = useSession();
  const t = useTranslations("comments");
  const [comments, setComments] = useState<CommentData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchComments = async (p: number) => {
    try {
      const res = await fetch(`/api/books/${bookId}/comments?page=${p}&limit=10`);
      const data = await res.json();
      setComments((prev) => (p === 1 ? data.comments : [...prev, ...data.comments]));
      setTotal(data.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComments(1);
  }, [bookId]);

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/books/${bookId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newComment.trim() }),
      });
      if (res.ok) {
        const comment = await res.json();
        setComments((prev) => [{ ...comment, replies: [], _count: { replies: 0 } }, ...prev]);
        setTotal((prev) => prev + 1);
        setNewComment("");
        toast.success(t("commentAdded"));
      }
    } catch {
      toast.error("Hiba történt");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleted = (id: string) => {
    setComments((prev) => {
      // Remove from top level
      const filtered = prev.filter((c) => c.id !== id);
      // Also remove from replies
      return filtered.map((c) => ({
        ...c,
        replies: c.replies?.filter((r) => r.id !== id),
      }));
    });
    setTotal((prev) => prev - 1);
  };

  const handleReplyAdded = (parentId: string, reply: CommentData) => {
    setComments((prev) =>
      prev.map((c) =>
        c.id === parentId
          ? { ...c, replies: [...(c.replies || []), reply] }
          : c
      )
    );
  };

  return (
    <div className="mt-8">
      <h3 className="mb-4 text-lg font-bold text-[var(--text-primary)]">
        {total > 0 ? t("titleWithCount", { count: total }) : t("title")}
      </h3>

      {/* Comment form */}
      {session?.user ? (
        <div className="mb-6">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={t("commentPlaceholder")}
            className="w-full rounded-lg border border-amber-200 bg-white p-3 text-sm text-[var(--text-primary)] placeholder:text-amber-600/40 focus:border-amber-500 focus:outline-none dark:border-amber-800/30 dark:bg-[var(--bg-card)]"
            rows={3}
            maxLength={2000}
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-[var(--text-muted)]">
              {newComment.length}/2000
            </span>
            <button
              onClick={handleSubmit}
              disabled={submitting || !newComment.trim()}
              className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
            >
              {submitting ? t("submitting") : t("submit")}
            </button>
          </div>
        </div>
      ) : (
        <p className="mb-4 text-sm text-[var(--text-muted)]">{t("signInToComment")}</p>
      )}

      {/* Comment list */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-200 border-t-amber-700" />
        </div>
      ) : comments.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--text-muted)]">{t("noComments")}</p>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <CommentCard
              key={comment.id}
              comment={comment}
              bookId={bookId}
              onDeleted={handleDeleted}
              onReplyAdded={(reply) => handleReplyAdded(comment.id, reply)}
            />
          ))}
        </div>
      )}

      {/* Load more */}
      {comments.length < total && !loading && (
        <button
          onClick={() => {
            const next = page + 1;
            setPage(next);
            fetchComments(next);
          }}
          className="mt-4 w-full rounded-lg border border-amber-200 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50"
        >
          {t("loadMore")}
        </button>
      )}
    </div>
  );
}
