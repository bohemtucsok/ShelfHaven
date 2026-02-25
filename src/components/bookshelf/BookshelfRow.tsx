"use client";

import BookSpine from "./BookSpine";

// Predefined book spine colors (rotating through them)
const SPINE_COLORS = [
  "#8B4513", "#654321", "#A0522D", "#6B3A2A", "#4A2C2A",
  "#2F4F4F", "#3B5323", "#4B0082", "#800020", "#1C3A5F",
  "#5C4033", "#704214", "#8B6914", "#556B2F", "#483D8B",
];

interface BookItem {
  id: string;
  title: string;
  author: string;
  coverUrl?: string | null;
  blurHash?: string | null;
  format?: string;
  progress?: number;
}

interface BookshelfRowProps {
  books: BookItem[];
  label?: string;
  colorOffset?: number;
}

export default function BookshelfRow({ books, label, colorOffset = 0 }: BookshelfRowProps) {
  return (
    <div className="relative mb-2">
      {/* Shelf label */}
      {label && (
        <div className="mb-1 ml-4">
          <span className="inline-block rounded-t-md bg-amber-800/80 px-3 py-1 text-xs font-semibold text-amber-100 shadow-sm">
            {label}
          </span>
        </div>
      )}

      {/* Books container */}
      <div className="relative">
        {/* Books on the shelf */}
        <div className="flex items-end gap-[2px] overflow-visible px-4 pb-0 pt-2">
          {books.map((book, index) => (
            <BookSpine
              key={book.id}
              id={book.id}
              title={book.title}
              author={book.author}
              coverUrl={book.coverUrl}
              blurHash={book.blurHash}
              color={SPINE_COLORS[(index + colorOffset) % SPINE_COLORS.length]}
              format={book.format}
              progress={book.progress}
            />
          ))}
          {books.length === 0 && (
            <p className="py-8 text-center text-sm italic text-amber-700/50 dark:text-[var(--text-muted)] w-full">
              Üres polc - tölts fel könyveket!
            </p>
          )}
        </div>

        {/* Wooden shelf (the plank) */}
        <div className="relative h-4 rounded-b-sm bg-gradient-to-b from-amber-800 via-amber-700 to-amber-900 shadow-[0_4px_8px_rgba(0,0,0,0.3)]">
          {/* Shelf edge highlight */}
          <div className="absolute inset-x-0 top-0 h-[2px] bg-amber-600/40" />
          {/* Shelf front face */}
          <div className="absolute inset-x-0 bottom-0 h-[6px] rounded-b-sm bg-gradient-to-b from-amber-900 to-amber-950" />
        </div>

        {/* Shelf brackets */}
        <div className="absolute -bottom-3 left-6 h-3 w-3 rounded-b-sm bg-amber-950/60" />
        <div className="absolute -bottom-3 right-6 h-3 w-3 rounded-b-sm bg-amber-950/60" />
      </div>
    </div>
  );
}
