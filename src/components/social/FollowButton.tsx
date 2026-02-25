"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

interface FollowButtonProps {
  userId: string;
  initialFollowing?: boolean;
  initialCount?: number;
}

export default function FollowButton({ userId, initialFollowing, initialCount }: FollowButtonProps) {
  const t = useTranslations("follow");
  const [following, setFollowing] = useState(initialFollowing ?? false);
  const [followerCount, setFollowerCount] = useState(initialCount ?? 0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialFollowing !== undefined) return;
    fetch(`/api/users/${userId}/follow`)
      .then((r) => r.json())
      .then((data) => {
        setFollowing(data.following);
        setFollowerCount(data.followerCount);
      })
      .catch(() => {});
  }, [userId, initialFollowing]);

  const handleToggle = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}/follow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setFollowing(data.following);
      setFollowerCount(data.followerCount);
      toast.success(data.following ? t("followSuccess") : t("unfollowSuccess"));
    } catch {
      toast.error("Hiba történt");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={handleToggle}
      disabled={loading}
      className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
        following
          ? "bg-amber-700 text-white hover:bg-amber-600"
          : "border border-amber-700 text-amber-700 hover:bg-amber-50"
      }`}
    >
      {following ? (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          {t("following")}
        </>
      ) : (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" />
          </svg>
          {t("follow")}
        </>
      )}
    </motion.button>
  );
}
