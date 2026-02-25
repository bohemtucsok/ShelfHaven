"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

interface CommentUser {
  id: string;
  name: string | null;
  avatarUrl: string;
}

export interface CommentData {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  user: CommentUser;
  replies?: CommentData[];
  _count?: { replies: number };
}

interface CommentCardProps {
  comment: CommentData;
  bookId: string;
  isReply?: boolean;
  onDeleted?: (id: string) => void;
  onReplyAdded?: (reply: CommentData) => void;
}

export default function CommentCard({ comment, bookId, isReply, onDeleted, onReplyAdded }: CommentCardProps) {
  const { data: session } = useSession();
  const t = useTranslations("comments");
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.content);
  const [displayContent, setDisplayContent] = useState(comment.content);

  const isOwner = session?.user?.id === comment.user.id;
  const isAdmin = session?.user?.role === "ADMIN";
  const timeAgo = getTimeAgo(new Date(comment.createdAt));

  const handleDelete = async () => {
    if (!confirm(t("deleteConfirm"))) return;
    try {
      const res = await fetch(`/api/comments/${comment.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        toast.success(t("commentDeleted"));
        onDeleted?.(comment.id);
      }
    } catch {
      toast.error("Hiba történt");
    }
  };

  const handleEdit = async () => {
    if (!editText.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/comments/${comment.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editText.trim() }),
      });
      if (res.ok) {
        setDisplayContent(editText.trim());
        setEditing(false);
        toast.success(t("commentUpdated"));
      }
    } catch {
      toast.error("Hiba történt");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/books/${bookId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: replyText.trim(), parentId: comment.id }),
      });
      if (res.ok) {
        const reply = await res.json();
        onReplyAdded?.(reply);
        setReplyText("");
        setShowReplyForm(false);
        toast.success(t("commentAdded"));
      }
    } catch {
      toast.error("Hiba történt");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={isReply ? "pl-8" : ""}
    >
      <div className="rounded-lg border border-amber-200/50 bg-amber-50/50 p-3 dark:border-amber-800/20 dark:bg-[var(--bg-card)]">
        <div className="flex items-start gap-3">
          <Link href={`/user/${comment.user.id}`}>
            <Image
              src={comment.user.avatarUrl}
              alt={comment.user.name || "Avatar"}
              width={32}
              height={32}
              className="h-8 w-8 rounded-full"
            />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Link href={`/user/${comment.user.id}`} className="text-sm font-semibold text-[var(--text-primary)] hover:underline">
                {comment.user.name || "?"}
              </Link>
              <span className="text-xs text-[var(--text-muted)]">{timeAgo}</span>
            </div>

            {editing ? (
              <div className="mt-2">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full rounded-lg border border-amber-200 bg-white p-2 text-sm text-[var(--text-primary)] focus:border-amber-500 focus:outline-none dark:border-amber-800/30 dark:bg-[var(--bg-card)]"
                  rows={2}
                  maxLength={2000}
                />
                <div className="mt-1 flex gap-2">
                  <button onClick={handleEdit} disabled={submitting} className="rounded px-3 py-1 text-xs font-medium bg-amber-700 text-white hover:bg-amber-600 disabled:opacity-50">
                    {t("submit")}
                  </button>
                  <button onClick={() => { setEditing(false); setEditText(displayContent); }} className="rounded px-3 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                    {t("cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-1 text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{displayContent}</p>
            )}

            {!editing && session?.user && (
              <div className="mt-2 flex items-center gap-3">
                {!isReply && (
                  <button
                    onClick={() => setShowReplyForm(!showReplyForm)}
                    className="text-xs font-medium text-amber-700 hover:text-amber-600"
                  >
                    {t("reply")}
                  </button>
                )}
                {isOwner && (
                  <button onClick={() => setEditing(true)} className="text-xs text-[var(--text-muted)] hover:text-amber-700">
                    {t("edit")}
                  </button>
                )}
                {(isOwner || isAdmin) && (
                  <button onClick={handleDelete} className="text-xs text-red-500 hover:text-red-400">
                    {t("delete")}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reply form */}
      {showReplyForm && (
        <div className="mt-2 pl-8">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={t("replyPlaceholder")}
            className="w-full rounded-lg border border-amber-200 bg-white p-2 text-sm text-[var(--text-primary)] placeholder:text-amber-600/40 focus:border-amber-500 focus:outline-none dark:border-amber-800/30 dark:bg-[var(--bg-card)]"
            rows={2}
            maxLength={2000}
          />
          <div className="mt-1 flex gap-2">
            <button onClick={handleReply} disabled={submitting || !replyText.trim()} className="rounded px-3 py-1 text-xs font-medium bg-amber-700 text-white hover:bg-amber-600 disabled:opacity-50">
              {submitting ? t("submitting") : t("submit")}
            </button>
            <button onClick={() => { setShowReplyForm(false); setReplyText(""); }} className="rounded px-3 py-1 text-xs text-[var(--text-muted)]">
              {t("cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Nested replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="mt-2 space-y-2">
          {comment.replies.map((reply) => (
            <CommentCard
              key={reply.id}
              comment={reply}
              bookId={bookId}
              isReply
              onDeleted={onDeleted}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "most";
  if (minutes < 60) return `${minutes} perce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} órája`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} napja`;
  const weeks = Math.floor(days / 7);
  return `${weeks} hete`;
}
