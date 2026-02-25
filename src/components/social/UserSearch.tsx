"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";

interface SearchUser {
  id: string;
  name: string | null;
  avatarUrl: string;
  bookCount: number;
}

interface UserSearchProps {
  className?: string;
}

export default function UserSearch({ className }: UserSearchProps) {
  const t = useTranslations("follow");
  const tc = useTranslations("common");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query.trim())}&limit=8`);
        const data = await res.json();
        setResults(data.users || []);
        setIsOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className || ""}`}>
      <div className="relative">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-600/60"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchUsers")}
          className="w-full rounded-lg border border-amber-200 bg-white py-2 pl-9 pr-4 text-sm text-[var(--text-primary)] placeholder:text-amber-600/40 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-amber-800/30 dark:bg-[var(--bg-card)]"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-200 border-t-amber-700" />
          </div>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-amber-200 bg-white shadow-lg dark:border-amber-800/30 dark:bg-[var(--bg-card)]">
          {results.map((user) => (
            <Link
              key={user.id}
              href={`/user/${user.id}`}
              onClick={() => {
                setIsOpen(false);
                setQuery("");
              }}
              className="flex items-center gap-3 px-3 py-2 transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-amber-50 dark:hover:bg-amber-900/20"
            >
              <Image
                src={user.avatarUrl}
                alt={user.name || "Avatar"}
                width={32}
                height={32}
                className="h-8 w-8 rounded-full"
              />
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">{user.name || "?"}</p>
                <p className="text-xs text-[var(--text-muted)]">{user.bookCount} {tc("books")}</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {isOpen && results.length === 0 && query.trim().length >= 2 && !loading && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-amber-200 bg-white p-3 text-center text-sm text-[var(--text-muted)] shadow-lg dark:border-amber-800/30 dark:bg-[var(--bg-card)]">
          {t("noUsersFound")}
        </div>
      )}
    </div>
  );
}
