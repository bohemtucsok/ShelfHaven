"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import ActivityCard, { type ActivityData } from "./ActivityCard";

export default function ActivityFeed() {
  const { data: session } = useSession();
  const t = useTranslations("activity");
  const [filter, setFilter] = useState<"following" | "all">(session?.user ? "following" : "all");
  const [activities, setActivities] = useState<ActivityData[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchActivities = async (p: number, f: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/activity?filter=${f}&page=${p}&limit=20`);
      const data = await res.json();
      setActivities((prev) => (p === 1 ? data.activities : [...prev, ...data.activities]));
      setTotal(data.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    fetchActivities(1, filter);
  }, [filter]);

  const handleFilterChange = (f: "following" | "all") => {
    setFilter(f);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t("title")}</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{t("subtitle")}</p>

      {/* Filter tabs */}
      {session?.user && (
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => handleFilterChange("following")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              filter === "following"
                ? "bg-amber-700 text-white"
                : "border border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800/30 dark:text-[var(--text-secondary)] dark:hover:bg-amber-900/20"
            }`}
          >
            {t("filterFollowing")}
          </button>
          <button
            onClick={() => handleFilterChange("all")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              filter === "all"
                ? "bg-amber-700 text-white"
                : "border border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800/30 dark:text-[var(--text-secondary)] dark:hover:bg-amber-900/20"
            }`}
          >
            {t("filterAll")}
          </button>
        </div>
      )}

      {/* Activity list */}
      <div className="mt-6 space-y-3">
        {!loading && activities.length === 0 && (
          <p className="py-12 text-center text-sm text-[var(--text-muted)]">
            {filter === "following" ? t("noFollowingActivity") : t("noActivity")}
          </p>
        )}

        {activities.map((activity, i) => (
          <motion.div
            key={activity.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i < 10 ? i * 0.03 : 0 }}
          >
            <ActivityCard activity={activity} />
          </motion.div>
        ))}

        {loading && (
          <div className="flex justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-200 border-t-amber-700" />
          </div>
        )}
      </div>

      {/* Load more */}
      {activities.length < total && !loading && (
        <button
          onClick={() => {
            const next = page + 1;
            setPage(next);
            fetchActivities(next, filter);
          }}
          className="mt-4 w-full rounded-lg border border-amber-200 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50"
        >
          {t("loadMore")}
        </button>
      )}
    </div>
  );
}
