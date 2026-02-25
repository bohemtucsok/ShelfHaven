"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

interface Recommendation {
  id: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  avgRating: number | null;
}

interface RecommendationSectionProps {
  bookId?: string;
  title?: string;
}

export default function RecommendationSection({ bookId, title }: RecommendationSectionProps) {
  const t = useTranslations("bookDetail");
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = bookId
      ? `/api/books/recommendations?bookId=${bookId}`
      : "/api/books/recommendations";
    fetch(url)
      .then((r) => r.json())
      .then((data) => setRecommendations(data.recommendations || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [bookId]);

  if (loading) return null;
  if (recommendations.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <h3 className="mb-4 text-lg font-bold text-[var(--text-primary)]">
        {title || t("similarBooks")}
      </h3>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {recommendations.map((book) => (
          <Link
            key={book.id}
            href={`/book/${book.id}`}
            className="group flex-shrink-0"
          >
            <div className="relative h-36 w-24 overflow-hidden rounded-lg bg-gradient-to-br from-amber-800 to-amber-950 shadow-md transition-transform group-hover:-translate-y-1 group-hover:shadow-lg">
              {book.coverUrl ? (
                <Image
                  src={book.coverUrl}
                  alt={book.title}
                  fill
                  className="object-cover"
                  sizes="96px"
                />
              ) : (
                <div className="flex h-full items-center justify-center p-2 text-center text-[10px] leading-tight text-amber-200/80">
                  {book.title}
                </div>
              )}
              {book.avgRating && (
                <div className="absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[10px] font-bold text-amber-300">
                  ★ {book.avgRating}
                </div>
              )}
            </div>
            <p className="mt-1.5 w-24 truncate text-xs font-medium text-[var(--text-primary)]">
              {book.title}
            </p>
            <p className="w-24 truncate text-[10px] text-[var(--text-muted)]">
              {book.author || ""}
            </p>
          </Link>
        ))}
      </div>
    </motion.div>
  );
}
