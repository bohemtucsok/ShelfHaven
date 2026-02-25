"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { useMemo } from "react";
import { blurHashToDataURL } from "@/lib/blurhash-to-url";

interface BookCoverProps {
  id: string;
  title: string;
  author: string;
  coverUrl?: string | null;
  blurHash?: string | null;
  format?: string;
  progress?: number;
  isOffline?: boolean;
  isSaved?: boolean;
  className?: string;
}

export default function BookCover({ id, title, author, coverUrl, blurHash, format, progress, isOffline, isSaved, className = "" }: BookCoverProps) {
  const blurDataURL = useMemo(
    () => (blurHash ? blurHashToDataURL(blurHash) : undefined),
    [blurHash]
  );

  return (
    <Link href={`/book/${id}`} className={`group block ${className}`}>
      <motion.div
        className="relative overflow-hidden rounded-lg shadow-lg transition-shadow group-hover:shadow-xl"
        whileHover={{ y: -8, scale: 1.02 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        {/* Cover image or placeholder */}
        <div className="relative aspect-[2/3] w-full bg-gradient-to-br from-amber-800 to-amber-950">
          {coverUrl ? (
            <Image
              src={coverUrl}
              alt={title}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 50vw, 200px"
              {...(blurDataURL ? { placeholder: "blur", blurDataURL } : {})}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-4 text-center">
              <span className="text-3xl">📖</span>
              <p className="mt-2 text-sm font-bold text-amber-100 line-clamp-3">{title}</p>
              <p className="mt-1 text-xs text-amber-200/70">{author}</p>
            </div>
          )}

          {/* Format badge */}
          {format && (
            <span className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-bold uppercase text-white backdrop-blur-sm">
              {format}
            </span>
          )}

          {/* Saved badge */}
          {isSaved && (
            <span className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-amber-600/80 text-white backdrop-blur-sm" title="Saved">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
              </svg>
            </span>
          )}

          {/* Offline badge */}
          {isOffline && (
            <span className={`absolute left-2 ${isSaved ? "top-8" : "top-2"} flex h-5 w-5 items-center justify-center rounded-full bg-green-500/80 text-white backdrop-blur-sm`} title="Available offline">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </span>
          )}

          {/* Reading progress bar */}
          {progress !== undefined && progress > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
              <div
                className="h-full bg-green-400 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        {/* Book info below cover */}
        <div className="bg-amber-50/90 p-3 dark:bg-[var(--bg-card)]">
          <p className="text-sm font-semibold text-amber-900 line-clamp-1 dark:text-[var(--text-primary)]">{title}</p>
          <p className="mt-0.5 text-xs text-amber-700/70 line-clamp-1 dark:text-[var(--text-muted)]">{author}</p>
        </div>
      </motion.div>
    </Link>
  );
}
