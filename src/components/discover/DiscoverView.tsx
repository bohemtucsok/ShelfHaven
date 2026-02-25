"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import DiscoverSection from "./DiscoverSection";
import TrendingCard from "./TrendingCard";
import UserSearch from "@/components/social/UserSearch";

interface DiscoverBook {
  id: string;
  title: string;
  author?: string | null;
  coverUrl: string | null;
}

interface TrendingBook {
  id: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  likes: number;
}

interface TopRatedBook extends DiscoverBook {
  avgRating: number;
  reviewCount: number;
}

interface FinishedBook extends DiscoverBook {
  finishedBy: number;
}

interface CategoryHighlight {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  books: DiscoverBook[];
}

interface DiscoverData {
  trending: TrendingBook[];
  newArrivals: DiscoverBook[];
  topRated: TopRatedBook[];
  recentlyFinished: FinishedBook[];
  categoryHighlights: CategoryHighlight[];
}

export default function DiscoverView() {
  const t = useTranslations("discover");
  const [data, setData] = useState<DiscoverData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/discover")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-200 border-t-amber-700" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t("title")}</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{t("subtitle")}</p>

      {/* User search */}
      <div className="mt-6">
        <UserSearch />
      </div>

      <div className="mt-8 space-y-10">
        {/* Trending */}
        {data.trending.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">{t("trending")}</h2>
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">{t("trendingDesc")}</p>
            <div className="mt-3 flex gap-4 overflow-x-auto pb-2">
              {data.trending.map((book, i) => (
                <TrendingCard key={book.id} book={book} rank={i + 1} />
              ))}
            </div>
          </motion.div>
        )}

        {/* New arrivals */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <DiscoverSection
            title={t("newArrivals")}
            description={t("newArrivalsDesc")}
            books={data.newArrivals}
          />
        </motion.div>

        {/* Top rated */}
        {data.topRated.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <DiscoverSection
              title={t("topRated")}
              description={t("topRatedDesc")}
              books={data.topRated}
              renderExtra={(book) => {
                const rated = data.topRated.find((r) => r.id === book.id);
                if (!rated) return null;
                return (
                  <div className="flex items-center justify-center gap-0.5 bg-black/60 py-0.5 text-[10px] text-amber-300">
                    <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    {rated.avgRating}
                  </div>
                );
              }}
            />
          </motion.div>
        )}

        {/* Recently finished */}
        {data.recentlyFinished.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <DiscoverSection
              title={t("recentlyFinished")}
              description={t("recentlyFinishedDesc")}
              books={data.recentlyFinished}
            />
          </motion.div>
        )}

        {/* Category highlights */}
        {data.categoryHighlights.map((cat, i) => (
          <motion.div
            key={cat.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + i * 0.1 }}
          >
            <DiscoverSection
              title={`${cat.icon || ""} ${cat.name}`.trim()}
              books={cat.books}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
