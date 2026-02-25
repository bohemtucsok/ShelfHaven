"use client";

import { motion } from "framer-motion";
import BookshelfRow from "./BookshelfRow";

interface BookItem {
  id: string;
  title: string;
  author: string;
  coverUrl?: string | null;
  blurHash?: string | null;
  format?: string;
  progress?: number;
}

interface ShelfGroup {
  label: string;
  books: BookItem[];
}

interface ShelfSceneProps {
  shelves: ShelfGroup[];
  className?: string;
}

export default function ShelfScene({ shelves, className = "" }: ShelfSceneProps) {
  return (
    <div className={`relative ${className}`}>
      {/* Wooden back panel */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-b from-amber-100/40 via-amber-50/20 to-amber-100/40 dark:from-amber-900/20 dark:via-amber-950/10 dark:to-amber-900/20 opacity-50" />

      <div className="relative space-y-8 py-6">
        {shelves.map((shelf, index) => (
          <motion.div
            key={shelf.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1, duration: 0.4 }}
          >
            <BookshelfRow
              books={shelf.books}
              label={shelf.label}
              colorOffset={index * 3}
            />
          </motion.div>
        ))}

        {shelves.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-lg text-amber-700/60 dark:text-[var(--text-muted)]">Még nincsenek könyveid</p>
            <p className="mt-1 text-sm text-amber-600/40 dark:text-[var(--text-muted)]">Töltsd fel az első könyved!</p>
          </div>
        )}
      </div>
    </div>
  );
}
