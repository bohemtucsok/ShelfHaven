"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface SaveToLibraryButtonProps {
  bookId: string;
  isOwned: boolean;
  initialSaved?: boolean;
  variant?: "icon" | "full";
}

export default function SaveToLibraryButton({
  bookId,
  isOwned,
  initialSaved = false,
  variant = "full",
}: SaveToLibraryButtonProps) {
  const { data: session } = useSession();
  const t = useTranslations("bookDetail");
  const [saved, setSaved] = useState(initialSaved);
  const [loading, setLoading] = useState(false);

  // Don't render for own books or unauthenticated users
  if (isOwned || !session?.user) return null;

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;

    setLoading(true);
    const wasSaved = saved;
    setSaved(!saved); // Optimistic update

    try {
      const res = await fetch(`/api/books/${bookId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        setSaved(wasSaved);
        toast.error(t("saveToLibraryFailed"));
        return;
      }

      const data = await res.json();
      setSaved(data.saved);
      toast.success(data.saved ? t("savedToLibrary") : t("removedFromLibrary"));
    } catch {
      setSaved(wasSaved);
      toast.error(t("saveToLibraryFailed"));
    } finally {
      setLoading(false);
    }
  };

  const BookmarkIcon = ({ filled }: { filled: boolean }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={variant === "icon" ? "h-4 w-4" : "h-4 w-4"}
      viewBox="0 0 20 20"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.5}
    >
      <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
    </svg>
  );

  if (variant === "icon") {
    return (
      <motion.button
        onClick={handleToggle}
        disabled={loading}
        whileTap={{ scale: 0.9 }}
        className={`flex h-7 w-7 items-center justify-center rounded-full shadow-md transition-colors ${
          saved
            ? "bg-amber-600 text-white"
            : "bg-black/60 text-white hover:bg-black/80"
        }`}
        title={saved ? t("savedToLibrary") : t("saveToLibrary")}
      >
        <BookmarkIcon filled={saved} />
      </motion.button>
    );
  }

  return (
    <motion.button
      onClick={handleToggle}
      disabled={loading}
      whileTap={{ scale: 0.97 }}
      className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
        saved
          ? "border-amber-600 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:border-[var(--accent-gold)] dark:text-[var(--accent-gold)]"
          : "border-amber-800/20 bg-white text-amber-800 hover:bg-amber-50 dark:bg-[var(--bg-secondary)] dark:text-[var(--text-primary)] dark:border-[var(--border)] dark:hover:bg-amber-900/30"
      } disabled:opacity-50`}
    >
      <BookmarkIcon filled={saved} />
      {saved ? t("savedToLibrary") : t("saveToLibrary")}
    </motion.button>
  );
}
