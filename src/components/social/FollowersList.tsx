"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";

interface FollowerUser {
  id: string;
  name: string | null;
  avatarUrl: string;
  followedAt: string;
}

interface FollowersListProps {
  userId: string;
  type: "followers" | "following";
  isOpen: boolean;
  onClose: () => void;
}

export default function FollowersList({ userId, type, isOpen, onClose }: FollowersListProps) {
  const t = useTranslations("follow");
  const [users, setUsers] = useState<FollowerUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setPage(1);
    setUsers([]);
    fetchPage(1);
  }, [isOpen, userId, type]);

  const fetchPage = async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}/${type}?page=${p}&limit=20`);
      const data = await res.json();
      const list = type === "followers" ? data.followers : data.following;
      setUsers((prev) => (p === 1 ? list : [...prev, ...list]));
      setTotal(data.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchPage(next);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-[var(--bg-card)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-[var(--text-primary)]">
              {type === "followers" ? t("followers") : t("following")} ({total})
            </h3>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-amber-100"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          <div className="max-h-80 space-y-2 overflow-y-auto">
            {users.map((user) => (
              <Link
                key={user.id}
                href={`/user/${user.id}`}
                onClick={onClose}
                className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-amber-50 dark:hover:bg-amber-900/20"
              >
                <Image
                  src={user.avatarUrl}
                  alt={user.name || "Avatar"}
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-full"
                />
                <span className="font-medium text-[var(--text-primary)]">
                  {user.name || "?"}
                </span>
              </Link>
            ))}

            {users.length === 0 && !loading && (
              <p className="py-4 text-center text-sm text-[var(--text-muted)]">
                {t("noUsersFound")}
              </p>
            )}

            {loading && (
              <div className="flex justify-center py-4">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-200 border-t-amber-700" />
              </div>
            )}
          </div>

          {users.length < total && !loading && (
            <button
              onClick={loadMore}
              className="mt-3 w-full rounded-lg border border-amber-200 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50"
            >
              {t("loadMore")}
            </button>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
